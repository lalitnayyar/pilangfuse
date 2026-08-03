import { config, hasEnv, requireEnv } from "../lib/config.js";
import { AppError } from "../lib/errors.js";
import { fetchJsonWithRetry } from "../lib/http.js";
import { truncate } from "../lib/utils.js";

function canUseProvider(provider) {
  if (provider === "tavily") return hasEnv("TAVILY_API_KEY");
  if (provider === "serpapi") return hasEnv("SERPAPI_API_KEY");
  return false;
}

async function tavilySearch(topic, progress) {
  const apiKey = requireEnv("TAVILY_API_KEY");
  const data = await fetchJsonWithRetry(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: topic,
        max_results: 5,
        search_depth: "advanced",
        include_answer: false,
        include_raw_content: false,
      }),
    },
    {
      label: "Tavily web search",
      onAttempt: ({ attempt, retries }) => {
        progress?.step("Agent 1", "🌐", "Searching the web", `Tavily attempt ${attempt}/${retries}`);
      },
    },
  );

  return (data.results || []).slice(0, 5).map((item, index) => ({
    index: index + 1,
    title: item.title || `Web result ${index + 1}`,
    url: item.url,
    brief: truncate(item.content || "No summary available."),
    score: item.score ?? null,
    source: "tavily",
  }));
}

async function serpApiWebSearch(topic, progress) {
  const apiKey = requireEnv("SERPAPI_API_KEY");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", topic);
  url.searchParams.set("num", "5");
  url.searchParams.set("api_key", apiKey);

  const data = await fetchJsonWithRetry(url, { method: "GET" }, {
    label: "SerpAPI web search",
    onAttempt: ({ attempt, retries }) => {
      progress?.step("Agent 1", "🌐", "Searching the web", `SerpAPI attempt ${attempt}/${retries}`);
    },
  });

  return (data.organic_results || []).slice(0, 5).map((item, index) => ({
    index: index + 1,
    title: item.title || `Web result ${index + 1}`,
    url: item.link,
    brief: truncate(item.snippet || "No summary available."),
    score: null,
    source: "serpapi",
  }));
}

const providers = {
  tavily: tavilySearch,
  serpapi: serpApiWebSearch,
};

export async function searchWebResources(topic, progress) {
  const primary = config.webSearchProvider;
  const fallback = primary === "tavily" ? "serpapi" : "tavily";

  if (!providers[primary]) {
    throw new AppError(`Unsupported web search provider: ${primary}`, {
      code: "INVALID_WEB_PROVIDER",
      status: 400,
    });
  }

  if (!canUseProvider(primary)) {
    if (config.allowProviderFallback && canUseProvider(fallback)) {
      progress?.warn("Agent 1", "⚠️", "Primary web provider unavailable", `Falling back to ${fallback}`);
      return providers[fallback](topic, progress);
    }

    throw new AppError(`Credentials missing for web search provider: ${primary}`, {
      code: "WEB_PROVIDER_CREDENTIALS_MISSING",
      status: 400,
    });
  }

  try {
    return await providers[primary](topic, progress);
  } catch (error) {
    if (config.allowProviderFallback && fallback !== primary && canUseProvider(fallback)) {
      progress?.warn("Agent 1", "⚠️", "Primary web provider failed", `Retrying with ${fallback}`);
      return providers[fallback](topic, progress);
    }
    throw error;
  }
}
