import { config, hasEnv, requireEnv } from "../lib/config.js";
import { AppError } from "../lib/errors.js";
import { fetchJsonWithRetry } from "../lib/http.js";
import { truncate } from "../lib/utils.js";

function canUseProvider(provider) {
  if (provider === "youtube") return hasEnv("YOUTUBE_API_KEY");
  if (provider === "serpapi") return hasEnv("SERPAPI_API_KEY");
  return false;
}

async function youtubeSearch(topic, progress) {
  const apiKey = requireEnv("YOUTUBE_API_KEY");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("q", topic);
  url.searchParams.set("key", apiKey);

  const data = await fetchJsonWithRetry(url, { method: "GET" }, {
    label: "YouTube video search",
    onAttempt: ({ attempt, retries }) => {
      progress?.step("Agent 2", "🎥", "Searching YouTube", `YouTube API attempt ${attempt}/${retries}`);
    },
  });

  return (data.items || []).slice(0, 5).map((item, index) => ({
    index: index + 1,
    title: item.snippet?.title || `Video result ${index + 1}`,
    url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    brief: truncate(item.snippet?.description || "No description available."),
    channel: item.snippet?.channelTitle || "Unknown channel",
    publishedAt: item.snippet?.publishedAt || null,
    source: "youtube",
  }));
}

async function serpApiYoutubeSearch(topic, progress) {
  const apiKey = requireEnv("SERPAPI_API_KEY");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "youtube");
  url.searchParams.set("search_query", topic);
  url.searchParams.set("api_key", apiKey);

  const data = await fetchJsonWithRetry(url, { method: "GET" }, {
    label: "SerpAPI YouTube search",
    onAttempt: ({ attempt, retries }) => {
      progress?.step("Agent 2", "🎥", "Searching YouTube", `SerpAPI attempt ${attempt}/${retries}`);
    },
  });

  const results = data.video_results || data.organic_results || [];
  return results.slice(0, 5).map((item, index) => ({
    index: index + 1,
    title: item.title || `Video result ${index + 1}`,
    url: item.link || item.url,
    brief: truncate(item.description || item.snippet || "No description available."),
    channel: item.channel?.name || item.channel || "Unknown channel",
    publishedAt: item.published_date || null,
    source: "serpapi",
  }));
}

const providers = {
  youtube: youtubeSearch,
  serpapi: serpApiYoutubeSearch,
};

export async function searchYoutubeVideos(topic, progress) {
  const primary = config.videoSearchProvider;
  const fallback = primary === "youtube" ? "serpapi" : "youtube";

  if (!providers[primary]) {
    throw new AppError(`Unsupported video search provider: ${primary}`, {
      code: "INVALID_VIDEO_PROVIDER",
      status: 400,
    });
  }

  if (!canUseProvider(primary)) {
    if (config.allowProviderFallback && canUseProvider(fallback)) {
      progress?.warn("Agent 2", "⚠️", "Primary video provider unavailable", `Falling back to ${fallback}`);
      return providers[fallback](topic, progress);
    }

    throw new AppError(`Credentials missing for video search provider: ${primary}`, {
      code: "VIDEO_PROVIDER_CREDENTIALS_MISSING",
      status: 400,
    });
  }

  try {
    return await providers[primary](topic, progress);
  } catch (error) {
    if (config.allowProviderFallback && fallback !== primary && canUseProvider(fallback)) {
      progress?.warn("Agent 2", "⚠️", "Primary video provider failed", `Retrying with ${fallback}`);
      return providers[fallback](topic, progress);
    }
    throw error;
  }
}
