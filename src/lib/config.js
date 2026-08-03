import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors.js";

export const ENV_FILE_PATH = path.resolve(process.cwd(), ".env");

export const settingsSchema = [
  {
    name: "OUTPUT_DIR",
    label: "Output directory",
    description: "Directory where generated markdown reports are stored.",
    group: "Server",
    type: "text",
    defaultValue: "reports",
  },
  {
    name: "PORT",
    label: "Server port",
    description: "Port used by the API and browser UI.",
    group: "Server",
    type: "number",
    defaultValue: "3000",
  },
  {
    name: "DOCKER_IMAGE_NAME",
    label: "Docker image name",
    description: "Image name used when pushing or deleting Docker images.",
    group: "Docker",
    type: "text",
    defaultValue: "",
  },
  {
    name: "DOCKER_IMAGE_TAG",
    label: "Docker image tag",
    description: "Docker image tag used with the configured image name.",
    group: "Docker",
    type: "text",
    defaultValue: "latest",
  },
  {
    name: "WEB_SEARCH_PROVIDER",
    label: "Web search provider",
    description: "Primary provider for web research.",
    group: "Providers",
    type: "select",
    options: ["tavily", "serpapi"],
    defaultValue: "tavily",
  },
  {
    name: "VIDEO_SEARCH_PROVIDER",
    label: "Video search provider",
    description: "Primary provider for video research.",
    group: "Providers",
    type: "select",
    options: ["youtube", "serpapi"],
    defaultValue: "youtube",
  },
  {
    name: "ALLOW_PROVIDER_FALLBACK",
    label: "Allow provider fallback",
    description: "Use the alternate provider when the primary provider fails or has no credentials.",
    group: "Providers",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "TAVILY_API_KEY",
    label: "Tavily API key",
    description: "Credential for Tavily web search.",
    group: "Providers",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "YOUTUBE_API_KEY",
    label: "YouTube API key",
    description: "Credential for YouTube Data API video search.",
    group: "Providers",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "SERPAPI_API_KEY",
    label: "SerpAPI key",
    description: "Credential for SerpAPI web and video search.",
    group: "Providers",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "HTTP_RETRY_COUNT",
    label: "HTTP retry count",
    description: "Number of retry attempts for outbound HTTP requests.",
    group: "Networking",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "HTTP_RETRY_DELAY_MS",
    label: "HTTP retry delay (ms)",
    description: "Base backoff delay between retry attempts.",
    group: "Networking",
    type: "number",
    defaultValue: "1200",
  },
  {
    name: "HTTP_TIMEOUT_MS",
    label: "HTTP timeout (ms)",
    description: "Timeout applied to each outbound HTTP request.",
    group: "Networking",
    type: "number",
    defaultValue: "30000",
  },
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
    description: "Optional key for richer LLM-based report generation.",
    group: "OpenAI",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "OPENAI_MODEL",
    label: "OpenAI model",
    description: "Model used for LLM-enhanced report generation.",
    group: "OpenAI",
    type: "text",
    defaultValue: "gpt-4.1-mini",
  },
  {
    name: "LANGFUSE_PUBLIC_KEY",
    label: "Langfuse public key",
    description: "Langfuse project public key.",
    group: "Langfuse",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "LANGFUSE_SECRET_KEY",
    label: "Langfuse secret key",
    description: "Langfuse project secret key.",
    group: "Langfuse",
    type: "password",
    secret: true,
    defaultValue: "",
  },
  {
    name: "LANGFUSE_BASE_URL",
    label: "Langfuse base URL",
    description: "Langfuse API host URL.",
    group: "Langfuse",
    type: "text",
    defaultValue: "https://cloud.langfuse.com",
  },
];

const settingsByName = new Map(settingsSchema.map((setting) => [setting.name, setting]));

function hasOwnEnvValue(name) {
  return Object.prototype.hasOwnProperty.call(process.env, name) && process.env[name] !== undefined;
}

export function getSettingValue(setting) {
  if (hasOwnEnvValue(setting.name)) {
    return process.env[setting.name];
  }
  return setting.defaultValue ?? "";
}

export function getConfig() {
  return {
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
}

export const config = new Proxy({}, {
  get(_target, property) {
    const resolvedConfig = getConfig();
    return resolvedConfig[property];
  },
});

export function listSettings() {
  return settingsSchema.map((setting) => ({
    ...setting,
    value: getSettingValue(setting),
  }));
}

function normalizeSettingValue(setting, value) {
  const rawValue = value == null ? "" : String(value).trim();

  if (setting.type === "number") {
    if (rawValue === "") return "";
    if (!/^\d+$/.test(rawValue)) {
      throw new AppError(`Invalid number for ${setting.name}`, {
        code: "INVALID_SETTING_VALUE",
        status: 400,
      });
    }
    return rawValue;
  }

  if (setting.type === "boolean") {
    if (rawValue === "") return "";
    const normalized = rawValue.toLowerCase();
    if (!["true", "false"].includes(normalized)) {
      throw new AppError(`Invalid boolean for ${setting.name}`, {
        code: "INVALID_SETTING_VALUE",
        status: 400,
      });
    }
    return normalized;
  }

  if (setting.type === "select") {
    if (rawValue === "") return "";
    const normalized = rawValue.toLowerCase();
    if (!setting.options?.includes(normalized)) {
      throw new AppError(`Invalid option for ${setting.name}`, {
        code: "INVALID_SETTING_VALUE",
        status: 400,
      });
    }
    return normalized;
  }

  return rawValue;
}

function serializeEnvValue(value) {
  const stringValue = String(value ?? "");

  if (stringValue === "") {
    return "";
  }

  if (/^[A-Za-z0-9_./:@-]+$/.test(stringValue)) {
    return stringValue;
  }

  return JSON.stringify(stringValue);
}

function parseEnvValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const quote = trimmed[0];
    const inner = trimmed.slice(1, -1);

    if (quote === '"') {
      try {
        return JSON.parse(trimmed);
      } catch {
        return inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
      }
    }

    return inner;
  }

  return trimmed;
}

function buildEnvContentFromSettings() {
  const lines = [];
  let currentGroup = null;

  for (const setting of settingsSchema) {
    if (setting.group !== currentGroup) {
      if (lines.length > 0) lines.push("");
      lines.push(`# ${setting.group}`);
      currentGroup = setting.group;
    }

    lines.push(`${setting.name}=${serializeEnvValue(getSettingValue(setting))}`);
  }

  return `${lines.join("\n")}\n`;
}

function updateEnvContent(content, updates) {
  const lines = content.split(/\r?\n/);
  const touched = new Set();

  const rewritten = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) return line;

    const name = match[1];
    if (!(name in updates)) return line;

    touched.add(name);
    return `${name}=${serializeEnvValue(updates[name])}`;
  });

  for (const [name, value] of Object.entries(updates)) {
    if (!touched.has(name)) {
      rewritten.push(`${name}=${serializeEnvValue(value)}`);
    }
  }

  const joined = rewritten.join("\n").trimEnd();
  return `${joined}\n`;
}

function applyManagedSettings(settingsMap = {}) {
  for (const setting of settingsSchema) {
    const value = Object.prototype.hasOwnProperty.call(settingsMap, setting.name)
      ? normalizeSettingValue(setting, settingsMap[setting.name])
      : String(setting.defaultValue ?? "");

    process.env[setting.name] = value;
  }
}

export async function readEnvFileContent() {
  try {
    return await readFile(ENV_FILE_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return buildEnvContentFromSettings();
    }
    throw error;
  }
}

export function parseManagedSettingsFromEnv(content) {
  const parsed = {};

  for (const rawLine of String(content ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    if (!settingsByName.has(name)) continue;
    parsed[name] = parseEnvValue(rawValue);
  }

  return parsed;
}

export async function importEnvFileContent(content) {
  const normalizedContent = String(content ?? "").replace(/\r\n/g, "\n").trimEnd();

  if (!normalizedContent.trim()) {
    throw new AppError("Imported .env content is empty", {
      code: "EMPTY_ENV_IMPORT",
      status: 400,
    });
  }

  const previousValues = Object.fromEntries(settingsSchema.map((setting) => [setting.name, getSettingValue(setting)]));
  const managedSettings = parseManagedSettingsFromEnv(normalizedContent);
  applyManagedSettings(managedSettings);
  await writeFile(ENV_FILE_PATH, `${normalizedContent}\n`, "utf8");

  const changedNames = settingsSchema
    .filter((setting) => previousValues[setting.name] !== getSettingValue(setting))
    .map((setting) => setting.name);

  return {
    settings: listSettings(),
    changedNames,
    restartRequired: changedNames.includes("PORT"),
  };
}

export async function saveSettings(updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new AppError("Settings payload must be an object", {
      code: "INVALID_SETTINGS_PAYLOAD",
      status: 400,
    });
  }

  const sanitizedUpdates = {};
  const changedNames = [];

  for (const [name, value] of Object.entries(updates)) {
    const setting = settingsByName.get(name);
    if (!setting) {
      throw new AppError(`Unknown setting: ${name}`, {
        code: "UNKNOWN_SETTING",
        status: 400,
      });
    }

    const normalizedValue = normalizeSettingValue(setting, value);
    sanitizedUpdates[name] = normalizedValue;

    if (getSettingValue(setting) !== normalizedValue) {
      changedNames.push(name);
    }
  }

  for (const [name, value] of Object.entries(sanitizedUpdates)) {
    process.env[name] = value;
  }

  const existingContent = await readEnvFileContent();
  const nextContent = updateEnvContent(existingContent, sanitizedUpdates);

  await writeFile(ENV_FILE_PATH, nextContent, "utf8");

  return {
    settings: listSettings(),
    changedNames,
    restartRequired: changedNames.includes("PORT"),
  };
}

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
