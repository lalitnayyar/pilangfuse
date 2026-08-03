import "dotenv/config";
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./lib/config.js";
import { AppError } from "./lib/errors.js";
import { createProgressReporter } from "./lib/logger.js";
import { runResearch } from "./workflow/runResearch.js";

const app = express();
const jobs = new Map();

app.use(express.json());
app.use("/reports", express.static(config.outputDir));
app.use(express.static(path.resolve(process.cwd(), "public")));

function getJobOrThrow(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new AppError("Job not found", { code: "JOB_NOT_FOUND", status: 404 });
  }
  return job;
}

function pushEvent(job, event) {
  job.events.push(event);
  for (const response of job.clients) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function buildJobPayload(job) {
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
    events: job.events,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pilangfuse", port: config.port });
});

app.post("/api/research", async (req, res, next) => {
  try {
    const topic = req.body?.topic?.trim();
    if (!topic) {
      throw new AppError("Topic is required", { code: "TOPIC_REQUIRED", status: 400 });
    }

    const job = {
      id: randomUUID(),
      topic,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      error: null,
      events: [],
      clients: new Set(),
    };

    jobs.set(job.id, job);
    res.status(202).json({ jobId: job.id, status: job.status });

    queueMicrotask(async () => {
      job.status = "running";
      job.updatedAt = new Date().toISOString();

      const reporter = createProgressReporter({
        onEvent: (event) => {
          job.updatedAt = new Date().toISOString();
          pushEvent(job, event);
        },
      });

      try {
        const result = await runResearch({ topic, progress: reporter });
        job.status = "completed";
        job.result = result;
        job.updatedAt = new Date().toISOString();
      } catch (error) {
        job.status = "failed";
        job.error = {
          message: error.message,
          code: error.code || "UNEXPECTED_ERROR",
        };
        job.updatedAt = new Date().toISOString();
      } finally {
        pushEvent(job, {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          agent: "System",
          emoji: job.status === "completed" ? "✅" : "❌",
          status: job.status,
          title: `Job ${job.status}`,
          detail: topic,
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/jobs/:jobId", (req, res, next) => {
  try {
    const job = getJobOrThrow(req.params.jobId);
    res.json(buildJobPayload(job));
  } catch (error) {
    next(error);
  }
});

app.get("/api/jobs/:jobId/events", (req, res, next) => {
  try {
    const job = getJobOrThrow(req.params.jobId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for (const event of job.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    job.clients.add(res);

    req.on("close", () => {
      job.clients.delete(res);
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: {
      message: error.message || "Internal server error",
      code: error.code || "INTERNAL_SERVER_ERROR",
      details: error.details || null,
    },
  });
});

app.listen(config.port, () => {
  console.log(`🚀 pilangfuse server running at http://localhost:${config.port}`);
});
