import { collectWebResearch } from "../agents/webAgent.js";
import { collectYoutubeResearch } from "../agents/videoAgent.js";
import { createResearchReport } from "../agents/reportAgent.js";
import { AppError, normalizeError } from "../lib/errors.js";
import { flushLangfuse, createWorkflowTrace } from "../lib/langfuse.js";
import { createProgressReporter } from "../lib/logger.js";

export async function runResearch({ topic, progress } = {}) {
  if (!topic?.trim()) {
    throw new AppError("Topic is required", { code: "TOPIC_REQUIRED", status: 400 });
  }

  const reporter = progress || createProgressReporter({ consoleOutput: true });
  const { langfuse, trace, tracingEnabled } = createWorkflowTrace(topic);

  reporter.startWorkflow(topic);
  reporter.step("Orchestrator", "🧭", "Agents dispatched", "Running web and video research in parallel");

  if (tracingEnabled) {
    reporter.success("Langfuse", "🧬", "Tracing active", "Workflow spans will be recorded");
  } else {
    reporter.warn("Langfuse", "⚠️", "Tracing disabled", "Set Langfuse credentials to capture spans");
  }

  try {
    const [webOutcome, videoOutcome] = await Promise.allSettled([
      collectWebResearch(topic, { trace, progress: reporter }),
      collectYoutubeResearch(topic, { trace, progress: reporter }),
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
    const report = await createResearchReport(topic, webResults, youtubeResults, { trace, progress: reporter });

    trace.update({
      output: {
        reportPath: report.filePath,
        reportUrl: report.reportUrl,
        webResults: webResults.length,
        youtubeResults: youtubeResults.length,
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
    trace.update({ level: "ERROR", statusMessage: normalized.message });
    reporter.error("Orchestrator", "❌", "Workflow failed", normalized.message);
    throw normalized;
  } finally {
    await flushLangfuse(langfuse);
  }
}
