import { startActiveObservation } from "@langfuse/tracing";
import { collectWebResearch } from "../agents/webAgent.js";
import { collectYoutubeResearch } from "../agents/videoAgent.js";
import { createResearchReport } from "../agents/reportAgent.js";
import { AppError, normalizeError } from "../lib/errors.js";
import { flushLangfuse, getLangfuseContext, initializeLangfuseTelemetry } from "../lib/langfuse.js";
import { createProgressReporter } from "../lib/logger.js";

function summarizeProgressEvent(event) {
  return {
    timestamp: event.timestamp,
    agent: event.agent,
    status: event.status,
    title: event.title,
    detail: event.detail,
  };
}

function createTraceAwareReporter(baseReporter, onObservationUpdate, metadataBase = {}) {
  const progressEvents = [];
  let lastStatus = "start";

  function capture(event) {
    if (!event) return event;

    progressEvents.push(summarizeProgressEvent(event));
    if (progressEvents.length > 30) {
      progressEvents.shift();
    }

    lastStatus = event.status;

    onObservationUpdate?.({
      metadata: {
        ...metadataBase,
        latestProgressEvent: summarizeProgressEvent(event),
        recentProgressEvents: progressEvents,
        progressEventCount: progressEvents.length,
        latestProgressStatus: lastStatus,
      },
    });

    return event;
  }

  return {
    startWorkflow(topic) {
      return capture(baseReporter.startWorkflow(topic));
    },
    step(agent, emoji, title, detail = "") {
      return capture(baseReporter.step(agent, emoji, title, detail));
    },
    success(agent, emoji, title, detail = "") {
      return capture(baseReporter.success(agent, emoji, title, detail));
    },
    warn(agent, emoji, title, detail = "") {
      return capture(baseReporter.warn(agent, emoji, title, detail));
    },
    error(agent, emoji, title, detail = "") {
      return capture(baseReporter.error(agent, emoji, title, detail));
    },
    getProgressSummary() {
      return {
        count: progressEvents.length,
        lastStatus,
        recentEvents: progressEvents,
      };
    },
  };
}

async function executeWorkflow(topic, baseReporter, context, tracingEnabled, workflowObservation = null) {
  const traceMetadataBase = {
    app: "pilangfuse",
    provider: context.provider,
    model: context.model,
    sessionId: context.sessionId,
    reasoningLevel: context.reasoningLevel,
    langfuseBaseUrl: context.baseUrl,
    tracingConfigured: context.configured,
  };

  const reporter = createTraceAwareReporter(
    baseReporter,
    tracingEnabled ? (payload) => workflowObservation?.update(payload) : null,
    traceMetadataBase,
  );

  workflowObservation?.update({
    input: { topic },
    metadata: traceMetadataBase,
  });

  reporter.startWorkflow(topic);
  reporter.step("Orchestrator", "🧭", "Agents dispatched", "Running web and video research in parallel");

  if (tracingEnabled) {
    reporter.success(
      "Langfuse",
      "🧬",
      "Tracing active",
      `Base URL: ${context.baseUrl}${context.sessionId ? ` · Session: ${context.sessionId}` : ""}`,
    );
  } else {
    reporter.warn("Langfuse", "⚠️", "Tracing disabled", "Set Langfuse credentials to capture spans");
  }

  try {
    const [webOutcome, videoOutcome] = await Promise.allSettled([
      collectWebResearch(topic, { progress: reporter }),
      collectYoutubeResearch(topic, { progress: reporter }),
    ]);

    if (webOutcome.status === "rejected" || videoOutcome.status === "rejected") {
      const errors = [webOutcome, videoOutcome]
        .filter((item) => item.status === "rejected")
        .map((item) => item.reason?.message || "Unknown failure");

      throw new AppError(`Research collection failed: ${errors.join(" | ")}`, {
        code: "COLLECTION_FAILED",
        status: 502,
        details: errors,
      });
    }

    const webResults = webOutcome.value;
    const youtubeResults = videoOutcome.value;

    reporter.step("Orchestrator", "🔗", "Research merged", "Passing structured findings to report agent");
    const report = await createResearchReport(topic, webResults, youtubeResults, { progress: reporter, context });
    const progressSummary = reporter.getProgressSummary();

    workflowObservation?.update({
      output: {
        reportPath: report.filePath,
        reportUrl: report.reportUrl,
        webResults: webResults.length,
        youtubeResults: youtubeResults.length,
        progressEvents: progressSummary.count,
        latestProgressStatus: progressSummary.lastStatus,
      },
      metadata: {
        ...traceMetadataBase,
        workflowCompleted: true,
        recentProgressEvents: progressSummary.recentEvents,
      },
    });

    reporter.success("Orchestrator", "🎉", "Workflow completed", report.filePath);
    return {
      topic,
      webResults,
      youtubeResults,
      report,
    };
  } catch (error) {
    const normalized = normalizeError(error, "Research workflow failed");
    const progressSummary = reporter.getProgressSummary();

    workflowObservation?.update({
      level: "ERROR",
      statusMessage: normalized.message,
      output: {
        error: normalized.message,
      },
      metadata: {
        ...traceMetadataBase,
        workflowCompleted: false,
        recentProgressEvents: progressSummary.recentEvents,
        latestProgressStatus: progressSummary.lastStatus,
      },
    });

    reporter.error("Orchestrator", "❌", "Workflow failed", normalized.message);
    throw normalized;
  } finally {
    if (tracingEnabled) {
      reporter.step("Langfuse", "🪄", "Flushing trace", "Sending buffered observations to Langfuse");
    }
  }
}

export async function runResearch({ topic, progress } = {}) {
  if (!topic?.trim()) {
    throw new AppError("Topic is required", { code: "TOPIC_REQUIRED", status: 400 });
  }

  const baseReporter = progress || createProgressReporter({ consoleOutput: true });
  const context = getLangfuseContext();
  const tracingEnabled = context.configured;

  if (tracingEnabled) {
    initializeLangfuseTelemetry();
  }

  try {
    if (tracingEnabled) {
      return await startActiveObservation("topic-research-agents", async (workflowObservation) => {
        return await executeWorkflow(topic, baseReporter, context, tracingEnabled, workflowObservation);
      });
    }

    return await executeWorkflow(topic, baseReporter, context, tracingEnabled, null);
  } finally {
    if (tracingEnabled) {
      await flushLangfuse();
    }
  }
}
