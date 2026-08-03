import path from "node:path";

export const config = {
  outputDir: path.resolve(process.cwd(), process.env.OUTPUT_DIR || "reports"),
  port: Number(process.env.PORT || 3000),
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  webSearchProvider: (process.env.WEB_SEARCH_PROVIDER || "tavily").toLowerCase(),
  videoSearchProvider: (process.env.VIDEO_SEARCH_PROVIDER || "youtube").toLowerCase(),
  allowProviderFallback: (process.env.ALLOW_PROVIDER_FALLBACK || "true").toLowerCase() !== "false",
  httpRetryCount: Number(process.env.HTTP_RETRY_COUNT || 3),
  httpRetryDelayMs: Number(process.env.HTTP_RETRY_DELAY_MS || 1200),
  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
};

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function hasEnv(name) {
  return Boolean(process.env[name]);
}
