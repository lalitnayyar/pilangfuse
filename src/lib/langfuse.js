import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { AppError } from "./errors.js";

let telemetryInitialized = false;
let telemetryInitError = null;
let langfuseSpanProcessor = null;
let tracerProvider = null;

export function detectLangfuseRegion(baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com") {
  if (baseUrl === "https://cloud.langfuse.com") return "eu";
  if (baseUrl === "https://us.cloud.langfuse.com") return "us";
  if (baseUrl === "https://jp.cloud.langfuse.com") return "jp";
  if (baseUrl === "https://hipaa.cloud.langfuse.com") return "hipaa";
  return "custom";
}

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function getLangfuseContext() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  return {
    publicKey,
    secretKey,
    baseUrl,
    configured: Boolean(publicKey && secretKey),
    provider: process.env.PI_PROVIDER || null,
    model: process.env.PI_MODEL || null,
    sessionId: process.env.PI_SESSION_ID || null,
    reasoningLevel: process.env.PI_REASONING_LEVEL || null,
  };
}

export function getLangfuseDebugInfo() {
  const context = getLangfuseContext();

  return {
    configured: context.configured,
    telemetryInitialized,
    telemetryInitError: telemetryInitError?.message || null,
    baseUrl: context.baseUrl,
    regionHint: detectLangfuseRegion(context.baseUrl),
    publicKeyPresent: Boolean(context.publicKey),
    secretKeyPresent: Boolean(context.secretKey),
    publicKeyPreview: maskValue(context.publicKey),
    secretKeyPreview: maskValue(context.secretKey),
    publicKeyLength: context.publicKey?.length || 0,
    secretKeyLength: context.secretKey?.length || 0,
    provider: context.provider,
    model: context.model,
    sessionId: context.sessionId,
    reasoningLevel: context.reasoningLevel,
  };
}

export function initializeLangfuseTelemetry() {
  const context = getLangfuseContext();

  if (!context.configured) {
    return { enabled: false, initialized: false, spanProcessor: null };
  }

  if (telemetryInitialized) {
    return { enabled: true, initialized: true, spanProcessor: langfuseSpanProcessor };
  }

  try {
    langfuseSpanProcessor = new LangfuseSpanProcessor({ exportMode: "immediate" });
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [langfuseSpanProcessor],
    });
    tracerProvider.register();

    telemetryInitialized = true;
    telemetryInitError = null;

    return { enabled: true, initialized: true, spanProcessor: langfuseSpanProcessor };
  } catch (error) {
    telemetryInitError = error;
    throw new AppError(`Failed to initialize Langfuse telemetry: ${error.message}`, {
      code: "LANGFUSE_INIT_FAILED",
      status: 500,
      details: {
        baseUrl: context.baseUrl,
        regionHint: detectLangfuseRegion(context.baseUrl),
      },
    });
  }
}

export function createObservedOpenAIClient(langfuseConfig = {}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured.", {
      code: "OPENAI_API_KEY_MISSING",
      status: 400,
    });
  }

  initializeLangfuseTelemetry();
  return observeOpenAI(new OpenAI({ apiKey }), langfuseConfig);
}

export async function testLangfuseConnection() {
  const context = getLangfuseContext();

  if (!context.configured) {
    throw new AppError("Langfuse credentials are not configured.", {
      code: "LANGFUSE_NOT_CONFIGURED",
      status: 400,
      details: getLangfuseDebugInfo(),
    });
  }

  initializeLangfuseTelemetry();

  try {
    const testedAt = new Date().toISOString();

    await startActiveObservation("settings-langfuse-connectivity-check", async (span) => {
      span.update({
        input: { testedAt },
        output: { ok: true, testedAt },
        metadata: {
          app: "pilangfuse",
          source: "settings-modal",
          provider: context.provider,
          model: context.model,
          sessionId: context.sessionId,
          langfuseBaseUrl: context.baseUrl,
        },
      });
    });

    await flushLangfuse();

    return {
      ok: true,
      testedAt,
      debug: getLangfuseDebugInfo(),
    };
  } catch (error) {
    throw new AppError(`Langfuse connection test failed: ${error.message}`, {
      code: "LANGFUSE_TEST_FAILED",
      status: 502,
      details: {
        debug: getLangfuseDebugInfo(),
        originalMessage: error.message,
      },
    });
  }
}

export async function flushLangfuse() {
  if (langfuseSpanProcessor?.forceFlush) {
    await langfuseSpanProcessor.forceFlush();
  }
}

export async function shutdownLangfuse() {
  if (langfuseSpanProcessor?.shutdown) {
    await langfuseSpanProcessor.shutdown();
  }
}
