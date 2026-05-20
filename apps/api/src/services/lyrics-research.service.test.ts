import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/google", () => {
  const googleFn = vi.fn(() => "mock-model");

  return {
    google: Object.assign(googleFn, {
      tools: { googleSearch: vi.fn(() => ({})) },
    }),
  };
});

const generateTextMock = vi.fn();
const noObjectIsInstanceMock = vi.fn();

vi.mock("ai", () => ({
  APICallError: { isInstance: () => false },
  generateText: (...args: Array<unknown>) => generateTextMock(...args),
  NoObjectGeneratedError: { isInstance: (e: unknown) => noObjectIsInstanceMock(e) },
  Output: { object: vi.fn(() => ({})) },
  RetryError: { isInstance: () => false },
  stepCountIs: vi.fn(() => ({})),
}));

vi.mock("@repo/db", () => ({
  Prisma: {},
  prisma: {
    lyrics: {
      update: vi.fn(),
    },
    lyricsResearch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { GOOGLE_GENERATIVE_AI_API_KEY: "fake-key", NODE_ENV: "test" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@repo/db";
import type { Lyrics } from "@repo/db";

import { AppError } from "@/middleware/error-handler";

import { MODEL_ID, PROMPT_VERSION } from "./lyrics-research.prompt";
import { LyricsResearchService } from "./lyrics-research.service";

const service = new LyricsResearchService();

const trackId = "track-1";
const lyricsId = "lyrics-1";
const contentHash = "abc123";

const baseTrack = {
  albumName: "Test Album",
  artistName: "Test Artist",
  title: "Test Track",
};

const baseLyrics = {
  attemptCount: 1,
  contentHash,
  createdAt: new Date("2024-01-01"),
  errorMessage: null,
  fetchedAt: new Date("2024-01-01"),
  id: lyricsId,
  language: null,
  lastAttemptAt: new Date("2024-01-01"),
  plainLyrics: "La la la\nLa la la",
  status: "AVAILABLE",
  syncedLyrics: null,
  trackId,
  updatedAt: new Date("2024-01-01"),
} as unknown as Lyrics;

const validNotes = {
  artistContext: "",
  detectedLanguage: "en-US",
  idioms: [],
  mood: ["happy"],
  perspective: { addressee: null, tense: "present", voice: "first" },
  references: [],
  songContext: "",
  summary: "A two-sentence summary.",
  themes: ["love"],
  translationHazards: [],
  wordplay: [],
};

const existingFresh = {
  createdAt: new Date("2024-01-02"),
  generatedAt: new Date("2024-01-02"),
  id: "research-1",
  lyricsId,
  modelId: MODEL_ID,
  notes: {},
  promptVersion: PROMPT_VERSION,
  sourceContentHash: contentHash,
  summary: "old",
  updatedAt: new Date("2024-01-02"),
};

describe("LyricsResearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noObjectIsInstanceMock.mockReturnValue(false);
  });

  describe("generate (preconditions)", () => {
    it("throws RESEARCH_PRECONDITION when status is not AVAILABLE", async () => {
      const lyrics = { ...baseLyrics, status: "INSTRUMENTAL" } as Lyrics;

      await expect(service.generate({ lyrics, track: baseTrack })).rejects.toMatchObject({
        code: "RESEARCH_PRECONDITION",
        statusCode: 400,
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("throws RESEARCH_PRECONDITION when plainLyrics is missing", async () => {
      const lyrics = { ...baseLyrics, plainLyrics: null } as Lyrics;

      await expect(service.generate({ lyrics, track: baseTrack })).rejects.toMatchObject({
        code: "RESEARCH_PRECONDITION",
      });
    });

    it("throws RESEARCH_PRECONDITION when contentHash is missing", async () => {
      const lyrics = { ...baseLyrics, contentHash: null } as Lyrics;

      await expect(service.generate({ lyrics, track: baseTrack })).rejects.toMatchObject({
        code: "RESEARCH_PRECONDITION",
      });
    });
  });

  describe("generate (idempotency)", () => {
    it("returns existing research without calling AI when provenance matches", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(existingFresh as never);

      const result = await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(result).toEqual(existingFresh);
      expect(generateTextMock).not.toHaveBeenCalled();
      expect(prisma.lyricsResearch.create).not.toHaveBeenCalled();
      expect(prisma.lyricsResearch.update).not.toHaveBeenCalled();
    });

    it("regenerates and updates when promptVersion is stale", async () => {
      const stale = { ...existingFresh, promptVersion: "research-v0" };
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.update).mockResolvedValue({
        ...stale,
        promptVersion: PROMPT_VERSION,
      } as never);

      await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(generateTextMock).toHaveBeenCalledOnce();
      expect(prisma.lyricsResearch.update).toHaveBeenCalledOnce();
      expect(prisma.lyricsResearch.create).not.toHaveBeenCalled();
      const updateCall = vi.mocked(prisma.lyricsResearch.update).mock.calls[0]?.[0];
      expect(updateCall?.data).toMatchObject({
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        sourceContentHash: contentHash,
        summary: validNotes.summary,
      });
      expect(updateCall?.data.notes).not.toHaveProperty("summary");
    });

    it("regenerates and updates when sourceContentHash changes", async () => {
      const stale = { ...existingFresh, sourceContentHash: "old-hash" };
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.update).mockResolvedValue(stale as never);

      await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(prisma.lyricsResearch.update).toHaveBeenCalledOnce();
    });
  });

  describe("generate (fresh)", () => {
    it("calls AI and creates a new research row when none exists", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.create).mockResolvedValue({
        ...existingFresh,
        summary: validNotes.summary,
      } as never);

      await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(generateTextMock).toHaveBeenCalledOnce();
      const createCall = vi.mocked(prisma.lyricsResearch.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        lyricsId,
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        sourceContentHash: contentHash,
        summary: validNotes.summary,
      });
      expect(createCall?.data.notes).not.toHaveProperty("summary");
      expect(createCall?.data.notes).toMatchObject({
        detectedLanguage: "en-US",
        mood: ["happy"],
        themes: ["love"],
      });
      expect(createCall?.data.generatedAt).toBeInstanceOf(Date);
    });

    it("backfills Lyrics.language when null and detectedLanguage is present", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.create).mockResolvedValue(existingFresh as never);

      await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(prisma.lyrics.update).toHaveBeenCalledWith({
        data: { language: "en-US" },
        where: { id: lyricsId },
      });
    });

    it("does not overwrite Lyrics.language when already set", async () => {
      const lyrics = { ...baseLyrics, language: "pt-BR" } as Lyrics;
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.create).mockResolvedValue(existingFresh as never);

      await service.generate({ lyrics, track: baseTrack });

      expect(prisma.lyrics.update).not.toHaveBeenCalled();
    });
  });

  describe("generate (failure paths)", () => {
    it("maps NoObjectGeneratedError to AppError(502, RESEARCH_PARSE_ERROR) without writing", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      const error = Object.assign(new Error("bad output"), { cause: "schema", text: "{}" });
      generateTextMock.mockRejectedValue(error);
      noObjectIsInstanceMock.mockImplementation((e) => e === error);

      await expect(service.generate({ lyrics: baseLyrics, track: baseTrack })).rejects.toThrow(
        AppError,
      );
      await expect(
        service.generate({ lyrics: baseLyrics, track: baseTrack }),
      ).rejects.toMatchObject({
        code: "RESEARCH_PARSE_ERROR",
        statusCode: 502,
      });
      expect(prisma.lyricsResearch.create).not.toHaveBeenCalled();
      expect(prisma.lyricsResearch.update).not.toHaveBeenCalled();
    });

    it("maps generic AI errors to AppError(502, RESEARCH_UPSTREAM_ERROR)", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockRejectedValue(new Error("network down"));

      await expect(
        service.generate({ lyrics: baseLyrics, track: baseTrack }),
      ).rejects.toMatchObject({
        code: "RESEARCH_UPSTREAM_ERROR",
        statusCode: 502,
      });
    });

    it("returns the existing row when create races with P2002", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.lyricsResearch.findUniqueOrThrow).mockResolvedValue(existingFresh as never);

      const result = await service.generate({ lyrics: baseLyrics, track: baseTrack });

      expect(result).toEqual(existingFresh);
      expect(prisma.lyricsResearch.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { lyricsId },
      });
    });

    it("wraps generic persist failures as AppError(500, RESEARCH_PERSIST_ERROR)", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: validNotes });
      vi.mocked(prisma.lyricsResearch.create).mockRejectedValue(new Error("DB connection lost"));

      await expect(
        service.generate({ lyrics: baseLyrics, track: baseTrack }),
      ).rejects.toMatchObject({
        code: "RESEARCH_PERSIST_ERROR",
        statusCode: 500,
      });
    });
  });

  describe("findByLyricsId", () => {
    it("returns the row when found", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(existingFresh as never);

      const result = await service.findByLyricsId(lyricsId);

      expect(result).toEqual(existingFresh);
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockResolvedValue(null as never);

      const result = await service.findByLyricsId(lyricsId);

      expect(result).toBeNull();
    });

    it("wraps DB errors as AppError(500, RESEARCH_FETCH_ERROR)", async () => {
      vi.mocked(prisma.lyricsResearch.findUnique).mockRejectedValue(new Error("DB down"));

      await expect(service.findByLyricsId(lyricsId)).rejects.toMatchObject({
        code: "RESEARCH_FETCH_ERROR",
        statusCode: 500,
      });
    });
  });
});
