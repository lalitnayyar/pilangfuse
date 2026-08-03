export class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AppError";
    this.code = options.code || "APP_ERROR";
    this.status = options.status || 500;
    this.details = options.details || null;
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
  }
}

export function normalizeError(error, fallbackMessage = "Unexpected error") {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(error?.message || fallbackMessage, {
    code: "UNEXPECTED_ERROR",
    cause: error,
    details: error,
  });
}
