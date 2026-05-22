import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NODE_ENV: "test" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { LrclibService } from "./lrclib.service";

const lrclibService = new LrclibService();

const mockLrclibResponse = {
  albumName: "Test Album",
  artistName: "Test Artist",
  duration: 180,
  id: 12_345,
  instrumental: false,
  plainLyrics: "La la la",
  syncedLyrics: "[00:00.00] La la la",
  trackName: "Test Track",
};

const createMockResponse = (body: unknown, { status = 200 }: { status?: number } = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("LrclibService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("getLyrics", () => {
    it("should return a found result on success", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockLrclibResponse));

      const result = await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      expect(result).toEqual({ data: mockLrclibResponse, kind: "found" });
    });

    it("should call fetch with track, artist, album, and duration query params", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockLrclibResponse));

      await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(calledUrl).toContain("lrclib.net/api/get");
      expect(calledUrl).toContain("track_name=Test+Track");
      expect(calledUrl).toContain("artist_name=Test+Artist");
      expect(calledUrl).toContain("album_name=Test+Album");
      expect(calledUrl).toContain("duration=180");
    });

    it("should send a User-Agent header", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockLrclibResponse));

      await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.["User-Agent"]).toMatch(/^Lyrikos v/v);
    });

    it("should return a not_found result on 404", async () => {
      fetchMock.mockResolvedValue(createMockResponse({ error: "not found" }, { status: 404 }));

      const result = await lrclibService.getLyrics("Missing", "Artist", "Album", 100);

      expect(result).toEqual({ kind: "not_found" });
    });

    it("should accept an optional instrumental track without syncedLyrics", async () => {
      const instrumental = { ...mockLrclibResponse, instrumental: true, syncedLyrics: null };
      fetchMock.mockResolvedValue(createMockResponse(instrumental));

      const result = await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      expect(result).toMatchObject({
        data: { instrumental: true, syncedLyrics: null },
        kind: "found",
      });
    });

    it("should return a failed result when upstream is not ok", async () => {
      fetchMock.mockResolvedValue(createMockResponse("upstream down", { status: 503 }));

      const result = await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      expect(result).toEqual({ errorMessage: "Upstream returned 503", kind: "failed" });
    });

    it("should return a failed result when response shape is invalid", async () => {
      fetchMock.mockResolvedValue(createMockResponse({ unexpected: "shape" }));

      const result = await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      expect(result).toEqual({
        errorMessage: "Invalid upstream response shape",
        kind: "failed",
      });
    });

    it("should return a failed result on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await lrclibService.getLyrics("Test Track", "Test Artist", "Test Album", 180);

      expect(result).toEqual({ errorMessage: "Network error", kind: "failed" });
    });
  });
});
