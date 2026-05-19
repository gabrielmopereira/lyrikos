import { beforeEach, describe, expect, it, vi } from "vitest";

const noObjectIsInstance = vi.fn();
const retryIsInstance = vi.fn();
const apiCallIsInstance = vi.fn();

vi.mock("ai", () => ({
  APICallError: { isInstance: (e: unknown) => apiCallIsInstance(e) },
  NoObjectGeneratedError: { isInstance: (e: unknown) => noObjectIsInstance(e) },
  RetryError: { isInstance: (e: unknown) => retryIsInstance(e) },
}));

import { describeAiError } from "./ai-errors";

describe("describeAiError", () => {
  beforeEach(() => {
    noObjectIsInstance.mockReset().mockReturnValue(false);
    retryIsInstance.mockReset().mockReturnValue(false);
    apiCallIsInstance.mockReset().mockReturnValue(false);
  });

  it("classifies NoObjectGeneratedError as schema", () => {
    const error = new Error("bad output");
    noObjectIsInstance.mockReturnValueOnce(true);

    expect(describeAiError(error)).toEqual({ isRetryable: false, kind: "schema" });
  });

  it("unwraps RetryError.lastError to surface upstream statusCode + retryCount", () => {
    const apiCallError = {
      data: { error: { message: "This model is currently experiencing high demand." } },
      isRetryable: true,
      responseBody: "{}",
      statusCode: 503,
      url: "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent",
    };
    const retryError = {
      errors: [apiCallError, apiCallError, apiCallError],
      lastError: apiCallError,
      reason: "maxRetriesExceeded",
    };
    retryIsInstance.mockImplementation((e) => e === retryError);
    apiCallIsInstance.mockImplementation((e) => e === apiCallError);

    expect(describeAiError(retryError)).toEqual({
      isRetryable: true,
      kind: "retry-exhausted",
      providerMessage: "This model is currently experiencing high demand.",
      retryCount: 3,
      statusCode: 503,
      url: "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent",
    });
  });

  it("classifies direct APICallError with extracted providerMessage", () => {
    const apiCallError = {
      data: { error: { message: "Rate limit exceeded" } },
      isRetryable: false,
      responseBody: "{}",
      statusCode: 429,
      url: "https://example.com/api",
    };
    apiCallIsInstance.mockImplementation((e) => e === apiCallError);

    expect(describeAiError(apiCallError)).toEqual({
      isRetryable: false,
      kind: "api",
      providerMessage: "Rate limit exceeded",
      statusCode: 429,
      url: "https://example.com/api",
    });
  });

  it("falls back to truncated responseBody when data.error.message is missing", () => {
    const longBody = "x".repeat(1000);
    const apiCallError = {
      data: null,
      isRetryable: true,
      responseBody: longBody,
      statusCode: 500,
      url: "https://example.com/api",
    };
    apiCallIsInstance.mockImplementation((e) => e === apiCallError);

    const info = describeAiError(apiCallError);

    expect(info.providerMessage).toHaveLength(500);
    expect(info.providerMessage).toBe("x".repeat(500));
  });

  it("classifies AbortError as abort", () => {
    const error = Object.assign(new Error("aborted"), { name: "AbortError" });

    expect(describeAiError(error)).toEqual({ isRetryable: false, kind: "abort" });
  });

  it("returns unknown for plain Error with its message as providerMessage", () => {
    const error = new Error("network down");

    expect(describeAiError(error)).toEqual({
      isRetryable: false,
      kind: "unknown",
      providerMessage: "network down",
    });
  });

  it("returns unknown without providerMessage for non-Error values", () => {
    expect(describeAiError("string error")).toEqual({ isRetryable: false, kind: "unknown" });
    expect(describeAiError(null)).toEqual({ isRetryable: false, kind: "unknown" });
  });
});
