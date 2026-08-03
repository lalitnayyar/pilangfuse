import "dotenv/config";
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config, importEnvFileContent, listSettings, readEnvFileContent, saveSettings } from "./lib/config.js";
import { deleteDockerImage, getDockerImageRef, listDockerImages } from "./lib/docker.js";
import { AppError } from "./lib/errors.js";
import { detectLangfuseRegion, getLangfuseDebugInfo, initializeLangfuseTelemetry, testLangfuseConnection } from "./lib/langfuse.js";
import { createProgressReporter } from "./lib/logger.js";
import { runResearch } from "./workflow/runResearch.js";

const app = express();
const jobs = new Map();
let server = null;
let portSwitchInFlight = false;

app.use(express.json());
app.use("/reports", (req, res, next) => {
  try {
    const reportsRoot = path.resolve(config.outputDir);
    const requestPath = req.path.replace(/^\/+/, "");
    const filePath = path.resolve(reportsRoot, requestPath || ".");

    if (filePath !== reportsRoot && !filePath.startsWith(`${reportsRoot}${path.sep}`)) {
      throw new AppError("Report not found", { code: "REPORT_NOT_FOUND", status: 404 });
    }

    res.sendFile(filePath, (error) => {
      if (!error) return;
      if (error.statusCode === 404 || error.code === "EISDIR") {
        next(new AppError("Report not found", { code: "REPORT_NOT_FOUND", status: 404 }));
        return;
      }
      next(error);
    });
  } catch (error) {
    next(error);
  }
});
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

function getSettingsPayload() {
  return {
    settings: listSettings(),
    docker: {
      imageName: process.env.DOCKER_IMAGE_NAME || "",
      imageTag: process.env.DOCKER_IMAGE_TAG || "latest",
      imageRef: getDockerImageRef(),
    },
  };
}

async function listenOnPort(port) {
  return await new Promise((resolve, reject) => {
    let nextServer = null;

    nextServer = app.listen(port, () => resolve(nextServer));
    nextServer.on("error", reject);
  });
}

async function switchServerPort(nextPort) {
  if (portSwitchInFlight) return;
  if (!server) return;

  const currentPort = Number(server.address()?.port || 0);
  if (currentPort === Number(nextPort)) return;

  portSwitchInFlight = true;

  try {
    const previousServer = server;
    const nextServer = await listenOnPort(nextPort);
    server = nextServer;

    previousServer.close((error) => {
      if (error) {
        console.error(`⚠️ Failed to close previous server on port ${currentPort}: ${error.message}`);
      }
    });

    console.log(`🔁 pilangfuse server moved to http://localhost:${nextPort}`);
  } finally {
    portSwitchInFlight = false;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "pilangfuse",
    port: Number(server?.address()?.port || config.port),
    timestamp: new Date().toISOString(),
    runtime: {
      pid: process.pid,
      nodeVersion: process.version,
      cwd: process.cwd(),
    },
    langfuse: getLangfuseDebugInfo(),
    hints: {
      langfuseRegion: detectLangfuseRegion(process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"),
    },
  });
});

app.get("/api/settings", (_req, res) => {
  res.json(getSettingsPayload());
});

app.post("/api/settings/langfuse/test", async (_req, res, next) => {
  try {
    const result = await testLangfuseConnection();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/export", async (_req, res, next) => {
  try {
    const content = await readEnvFileContent();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename=".env"');
    res.send(content);
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings/import", async (req, res, next) => {
  try {
    const result = await importEnvFileContent(req.body?.content || "");
    const nextPort = Number(process.env.PORT || 3000);

    res.json({
      ok: true,
      ...getSettingsPayload(),
      changedNames: result.changedNames,
      restartRequired: result.restartRequired,
      nextPort: result.restartRequired ? nextPort : null,
    });

    if (result.restartRequired) {
      setTimeout(() => {
        switchServerPort(nextPort).catch((error) => {
          console.error(`❌ Failed to switch server port: ${error.message}`);
        });
      }, 150);
    }
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", async (req, res, next) => {
  try {
    const result = await saveSettings(req.body?.settings || {});
    const nextPort = Number(process.env.PORT || 3000);

    res.json({
      ok: true,
      ...getSettingsPayload(),
      changedNames: result.changedNames,
      restartRequired: result.restartRequired,
      nextPort: result.restartRequired ? nextPort : null,
    });

    if (result.restartRequired) {
      setTimeout(() => {
        switchServerPort(nextPort).catch((error) => {
          console.error(`❌ Failed to switch server port: ${error.message}`);
        });
      }, 150);
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/docker/images", async (_req, res, next) => {
  try {
    const images = await listDockerImages();
    res.json({
      ok: true,
      configuredImageRef: getDockerImageRef(),
      images,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/docker/delete-image", async (req, res, next) => {
  try {
    const imageId = req.body?.imageId ?? "";
    const imageName = req.body?.imageName ?? process.env.DOCKER_IMAGE_NAME;
    const imageTag = req.body?.imageTag ?? process.env.DOCKER_IMAGE_TAG;
    const result = await deleteDockerImage({ imageId, imageName, imageTag, force: req.body?.force !== false });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
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

server = await listenOnPort(config.port);
console.log(`🚀 pilangfuse server running at http://localhost:${config.port}`);

try {
  const langfuseStatus = initializeLangfuseTelemetry();
  const debugInfo = getLangfuseDebugInfo();
  if (langfuseStatus.enabled) {
    console.log(`🧬 Langfuse telemetry initialized (${debugInfo.baseUrl}, region=${debugInfo.regionHint})`);
  } else {
    console.warn(`⚠️ Langfuse telemetry disabled: missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY (region=${debugInfo.regionHint})`);
  }
} catch (error) {
  const debugInfo = getLangfuseDebugInfo();
  console.error(`❌ Langfuse telemetry initialization failed: ${error.message} (region=${debugInfo.regionHint})`);
}
