import { startActiveObservation } from "@langfuse/tracing";
import { AppError } from "../lib/errors.js";
import { searchWebResources } from "../providers/webSearch.js";

export async function collectWebResearch(topic, { progress }) {
  return await startActiveObservation("agent1-web-search", async (span) => {
    span.update({
      input: { topic },
      metadata: {
        agent: "web",
      },
    });

    progress?.step("Agent 1", "🌐", "Web research initiated", "Collecting top 5 web resources");

    try {
      const results = await searchWebResources(topic, progress);

      if (!results.length) {
        throw new AppError("No web resources returned for the topic", {
          code: "NO_WEB_RESULTS",
          status: 502,
        });
      }

      progress?.success("Agent 1", "✅", "Web research completed", `${results.length} sources collected`);
      span.update({
        output: {
          count: results.length,
          results,
        },
      });
      return results;
    } catch (error) {
      progress?.error("Agent 1", "❌", "Web research failed", error.message);
      span.update({
        level: "ERROR",
        statusMessage: error.message,
        output: {
          error: error.message,
        },
      });
      throw error;
    }
  });
}
