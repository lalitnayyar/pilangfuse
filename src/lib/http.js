import { config } from "./config.js";
import { AppError } from "./errors.js";
import { sleep } from "./utils.js";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchJsonWithRetry(url, options = {}, meta = {}) {
  const retries = meta.retries ?? config.httpRetryCount;
  const retryDelayMs = meta.retryDelayMs ?? config.httpRetryDelayMs;
  const timeoutMs = meta.timeoutMs ?? config.httpTimeoutMs;
  const label = meta.label || "HTTP request";
  const onAttempt = meta.onAttempt;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      onAttempt?.({ attempt, retries, label });

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);

        if (retryable && attempt < retries) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw new AppError(`${label} failed with status ${response.status}`, {
          code: "HTTP_ERROR",
          status: response.status,
          retryable,
          details: { body },
        });
      }

      return await response.json();
    } catch (error) {
      const retryable = error.name === "AbortError" || error.retryable || error.code === "ECONNRESET";

      if (retryable && attempt < retries) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(`${label} failed`, {
        code: error.name === "AbortError" ? "HTTP_TIMEOUT" : "HTTP_REQUEST_FAILED",
        retryable,
        cause: error,
        details: { originalMessage: error.message },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new AppError(`${label} exhausted retries`, {
    code: "HTTP_RETRIES_EXHAUSTED",
    retryable: true,
  });
}
