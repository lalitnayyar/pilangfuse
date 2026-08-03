import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startActiveObservation } from "@langfuse/tracing";
import { config, requireEnv } from "../lib/config.js";
import { createObservedOpenAIClient } from "../lib/langfuse.js";
import { slugify, timestampForFilename } from "../lib/utils.js";

function buildDeterministicMarkdown({ topic, generatedAt, webResults, youtubeResults }) {
  const webSection = webResults
    .map(
      (item) =>
        `### ${item.index}. [${item.title}](${item.url})\n- Brief: ${item.brief}\n- Source: ${item.source}\n- Relevance score: ${item.score ?? "n/a"}`,
    )
    .join("\n\n");

  const videoSection = youtubeResults
    .map(
      (item) =>
        `### ${item.index}. [${item.title}](${item.url})\n- Channel: ${item.channel}\n- Published: ${item.publishedAt ?? "n/a"}\n- Source: ${item.source}\n- Brief: ${item.brief}`,
    )
    .join("\n\n");

  return `# ${topic}\n\nGenerated: ${generatedAt}\n\n## Executive Summary\nThis shareable research brief combines curated web resources and YouTube videos for **${topic}**. It is designed for quick reading, team sharing, and follow-up exploration.\n\n## 🌐 Top 5 Web Resources\n\n${webSection}\n\n## 🎥 Top 5 YouTube Videos\n\n${videoSection}\n\n## Key Takeaways\n- Use the web resources for structured reading and reference material.\n- Use the videos to compare practical demonstrations, commentary, and expert explanation.\n- Share this file with collaborators as a ready-to-review research packet.\n`;
}

async function buildOpenAiMarkdown({ topic, generatedAt, webResults, youtubeResults, progress, context }) {
  requireEnv("OPENAI_API_KEY");
  progress?.step("Agent 3", "🤖", "LLM enhancement enabled", `Using ${config.openAiModel} for polished markdown`);

  const openai = createObservedOpenAIClient({
    generationName: "openai-report-generation",
    sessionId: context?.sessionId || undefined,
    traceName: "topic-research-agents",
    generationMetadata: {
      provider: "openai",
      feature: "report-generation",
      topic,
    },
  });

  const response = await openai.chat.completions.create({
    model: config.openAiModel,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a research editor. Create concise, professional, shareable markdown using only the supplied sources. Do not invent facts. Include sections: Title, Executive Summary, 5 Web Resources, 5 YouTube Videos, and Key Takeaways.",
      },
      {
        role: "user",
        content: JSON.stringify({
          topic,
          generatedAt,
          webResults,
          youtubeResults,
          instructions:
            "For each resource, include a 1-2 sentence brief. Keep the document crisp, professional, and easy to share.",
        }),
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim();
}

export async function createResearchReport(topic, webResults, youtubeResults, { progress, context }) {
  return await startActiveObservation("agent3-report-writer", async (span) => {
    const generatedAt = new Date().toISOString();

    span.update({
      input: { topic, webCount: webResults.length, youtubeCount: youtubeResults.length },
      metadata: {
        agent: "report",
      },
    });

    progress?.step("Agent 3", "📝", "Report generation started", "Building shareable markdown report");

    try {
      let markdown = null;

      if (process.env.OPENAI_API_KEY) {
        try {
          markdown = await buildOpenAiMarkdown({
            topic,
            generatedAt,
            webResults,
            youtubeResults,
            progress,
            context,
          });
        } catch (error) {
          progress?.warn("Agent 3", "⚠️", "LLM enhancement failed", "Falling back to deterministic markdown");
        }
      }

      if (!markdown) {
        progress?.step("Agent 3", "🧾", "Using deterministic formatter", "Generating report without LLM dependency");
        markdown = buildDeterministicMarkdown({ topic, generatedAt, webResults, youtubeResults });
      }

      await mkdir(config.outputDir, { recursive: true });
      const filename = `${slugify(topic)}-${timestampForFilename(new Date())}.md`;
      const filePath = path.join(config.outputDir, filename);
      await writeFile(filePath, markdown, "utf8");

      const result = {
        filePath,
        reportUrl: `/reports/${filename}`,
        markdown,
      };

      progress?.success("Agent 3", "✅", "Report ready", path.basename(filePath));
      span.update({
        output: {
          filePath,
          reportUrl: result.reportUrl,
          characters: markdown.length,
        },
      });
      return result;
    } catch (error) {
      progress?.error("Agent 3", "❌", "Report generation failed", error.message);
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
