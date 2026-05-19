import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

export type AiErrorKind = "abort" | "api" | "retry-exhausted" | "schema" | "unknown";

export type AiErrorInfo = {
  isRetryable?: boolean;
  kind: AiErrorKind;
  providerMessage?: string;
  retryCount?: number;
  statusCode?: number;
  url?: string;
};

const MAX_PROVIDER_MESSAGE = 500;

const truncate = (text: string): string =>
  text.length > MAX_PROVIDER_MESSAGE ? text.slice(0, MAX_PROVIDER_MESSAGE) : text;

const extractApiCallMessage = (error: APICallError): string | undefined => {
  const data = error.data as { error?: { message?: unknown } } | null | undefined;

  if (typeof data?.error?.message === "string") {
    return truncate(data.error.message);
  }

  if (typeof error.responseBody === "string" && error.responseBody.length > 0) {
    return truncate(error.responseBody);
  }

  return undefined;
};

const describeApiCallError = (error: APICallError): Omit<AiErrorInfo, "kind"> => ({
  isRetryable: error.isRetryable,
  providerMessage: extractApiCallMessage(error),
  statusCode: error.statusCode,
  url: error.url,
});

export const describeAiError = (error: unknown): AiErrorInfo => {
  if (NoObjectGeneratedError.isInstance(error)) {
    return { isRetryable: false, kind: "schema" };
  }

  if (RetryError.isInstance(error)) {
    const last = error.lastError;
    const apiInfo = APICallError.isInstance(last) ? describeApiCallError(last) : {};
    return {
      ...apiInfo,
      kind: "retry-exhausted",
      retryCount: error.errors.length,
    };
  }

  if (APICallError.isInstance(error)) {
    return {
      ...describeApiCallError(error),
      kind: "api",
    };
  }

  if (error instanceof Error && error.name === "AbortError") {
    return { isRetryable: false, kind: "abort" };
  }

  if (error instanceof Error) {
    return { isRetryable: false, kind: "unknown", providerMessage: truncate(error.message) };
  }

  return { isRetryable: false, kind: "unknown" };
};
