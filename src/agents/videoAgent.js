import { startActiveObservation } from "@langfuse/tracing";
import { AppError } from "../lib/errors.js";
import { searchYoutubeVideos } from "../providers/videoSearch.js";

export async function collectYoutubeResearch(topic, { progress }) {
  return await startActiveObservation("agent2-youtube-search", async (span) => {
    span.update({
      input: { topic },
      metadata: {
        agent: "video",
      },
    });

    progress?.step("Agent 2", "🎥", "Video research initiated", "Collecting top 5 YouTube videos");

    try {
      const results = await searchYoutubeVideos(topic, progress);

      if (!results.length) {
        throw new AppError("No YouTube videos returned for the topic", {
          code: "NO_VIDEO_RESULTS",
          status: 502,
        });
      }

      progress?.success("Agent 2", "✅", "Video research completed", `${results.length} videos collected`);
      span.update({
        output: {
          count: results.length,
          results,
        },
      });
      return results;
    } catch (error) {
      progress?.error("Agent 2", "❌", "Video research failed", error.message);
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
