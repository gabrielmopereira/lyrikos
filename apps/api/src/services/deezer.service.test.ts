import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NODE_ENV: "test" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { AppError } from "@/middleware/error-handler";

import { DeezerService } from "./deezer.service";

const deezerService = new DeezerService();

const mockDeezerTrack = {
  album: {
    cover_big: "https://example.com/big.jpg",
    cover_medium: "https://example.com/medium.jpg",
    cover_small: "https://example.com/small.jpg",
    cover_xl: "https://example.com/xl.jpg",
    id: 1,
    title: "Test Album",
  },
  artist: {
    id: 1,
    name: "Test Artist",
    picture_big: "https://example.com/big.jpg",
    picture_medium: "https://example.com/medium.jpg",
    picture_small: "https://example.com/small.jpg",
    picture_xl: "https://example.com/xl.jpg",
  },
  duration: 180,
  explicit_lyrics: false,
  id: 1,
  isrc: "USRC17607839",
  readable: true,
  title: "Test Track",
  title_short: "Test Track",
};

const mockDeezerSearchResponse = {
  data: [mockDeezerTrack],
  total: 1,
};

const createMockResponse = (body: unknown, { status = 200 }: { status?: number } = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("DeezerService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("search", () => {
    it("should return parsed response on success", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockDeezerSearchResponse));

      const result = await deezerService.search("brutalismus");

      expect(result).toEqual(mockDeezerSearchResponse);
    });

    it("should call fetch with default limit and index", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockDeezerSearchResponse));

      await deezerService.search("brutalismus");

      const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(calledUrl).toContain("q=brutalismus");
      expect(calledUrl).toContain("limit=10");
      expect(calledUrl).toContain("index=0");
      expect(calledUrl).not.toContain("order=");
    });

    it("should forward custom limit and index", async () => {
      fetchMock.mockResolvedValue(createMockResponse(mockDeezerSearchResponse));

      await deezerService.search("brutalismus", 25, 50);

      const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(calledUrl).toContain("limit=25");
      expect(calledUrl).toContain("index=50");
    });

    it("should throw AppError 502 when upstream is not ok", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(createMockResponse({ error: "upstream error" }, { status: 503 })),
      );

      await expect(deezerService.search("brutalismus")).rejects.toThrow(AppError);
      await expect(deezerService.search("brutalismus")).rejects.toMatchObject({
        code: "DEEZER_UPSTREAM_ERROR",
        statusCode: 502,
      });
    });

    it("should throw AppError 500 PARSE_ERROR when response shape is invalid", async () => {
      fetchMock.mockResolvedValue(createMockResponse({ unexpected: "shape" }));

      await expect(deezerService.search("brutalismus")).rejects.toMatchObject({
        code: "PARSE_ERROR",
        statusCode: 500,
      });
    });

    it("should throw AppError 500 SEARCH_ERROR on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      await expect(deezerService.search("brutalismus")).rejects.toMatchObject({
        code: "SEARCH_ERROR",
        statusCode: 500,
      });
    });
  });
});
