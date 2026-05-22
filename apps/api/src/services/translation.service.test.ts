import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/anthropic", () => {
  const anthropicFn = vi.fn(() => "mock-model");

  return {
    anthropic: anthropicFn,
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
}));

vi.mock("@repo/db", () => ({
  Prisma: {},
  prisma: {
    translation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "fake-key", NODE_ENV: "test" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@repo/db";
import type { Lyrics, LyricsResearch } from "@repo/db";

import { computeResearchVersion } from "@/lib/version";
import { AppError } from "@/middleware/error-handler";

import { MODEL_ID, PROMPT_VERSION } from "./translation.prompt";
import { TranslationService } from "./translation.service";

const service = new TranslationService();

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
  language: "en-US",
  lastAttemptAt: new Date("2024-01-01"),
  plainLyrics: "Line one\nLine two\n\nLine four",
  status: "AVAILABLE",
  syncedLyrics: null,
  trackId,
  updatedAt: new Date("2024-01-01"),
} as unknown as Lyrics;

const baseResearch = {
  createdAt: new Date("2024-01-02"),
  generatedAt: new Date("2024-01-02"),
  id: "research-1",
  lyricsId,
  modelId: "gemini-3-flash-preview",
  notes: {
    idioms: [],
    mood: ["wistful"],
    perspective: { addressee: null, tense: "present", voice: "first" },
    references: [],
    themes: ["love"],
    translationHazards: [],
    wordplay: [],
  },
  promptVersion: "research-v1",
  sourceContentHash: contentHash,
  summary: "A short summary for the translator.",
  updatedAt: new Date("2024-01-02"),
} as unknown as LyricsResearch;

const buildOutput = () => ({
  segments: [
    { index: 0, note: null, original: "Line one", translated: "Linha um" },
    { index: 1, note: null, original: "Line two", translated: "Linha dois" },
    { index: 2, note: null, original: "", translated: "" },
    { index: 3, note: null, original: "Line four", translated: "Linha quatro" },
  ],
  selfScore: 0.9,
  translatorNote: null,
});

const buildExistingTranslation = async () => ({
  createdAt: new Date("2024-01-03"),
  downvotes: 0,
  generatedAt: new Date("2024-01-03"),
  id: "translation-1",
  language: "pt-BR",
  modelId: MODEL_ID,
  promptVersion: PROMPT_VERSION,
  researchVersion: await computeResearchVersion(baseResearch),
  segments: buildOutput().segments,
  selfScore: 0.9,
  sourceContentHash: contentHash,
  status: "FRESH",
  trackId,
  translatorNote: null,
  updatedAt: new Date("2024-01-03"),
  upvotes: 0,
});

const callGenerate = (overrides: Partial<Parameters<typeof service.generate>[0]> = {}) =>
  service.generate({
    lyrics: baseLyrics,
    research: baseResearch,
    targetLanguage: "pt-BR",
    track: baseTrack,
    ...overrides,
  });

describe("TranslationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noObjectIsInstanceMock.mockReturnValue(false);
  });

  describe("generate (preconditions)", () => {
    it("throws TRANSLATION_PRECONDITION when status is not AVAILABLE", async () => {
      const lyrics = { ...baseLyrics, status: "INSTRUMENTAL" } as Lyrics;

      await expect(callGenerate({ lyrics })).rejects.toMatchObject({
        code: "TRANSLATION_PRECONDITION",
        statusCode: 400,
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("throws TRANSLATION_PRECONDITION when plainLyrics is missing", async () => {
      const lyrics = { ...baseLyrics, plainLyrics: null } as Lyrics;

      await expect(callGenerate({ lyrics })).rejects.toMatchObject({
        code: "TRANSLATION_PRECONDITION",
      });
    });

    it("throws TRANSLATION_PRECONDITION when contentHash is missing", async () => {
      const lyrics = { ...baseLyrics, contentHash: null } as Lyrics;

      await expect(callGenerate({ lyrics })).rejects.toMatchObject({
        code: "TRANSLATION_PRECONDITION",
      });
    });

    it("throws TRANSLATION_PRECONDITION when source language is null", async () => {
      const lyrics = { ...baseLyrics, language: null } as Lyrics;

      await expect(callGenerate({ lyrics })).rejects.toMatchObject({
        code: "TRANSLATION_PRECONDITION",
      });
    });

    it("throws TRANSLATION_PRECONDITION when research belongs to different lyrics", async () => {
      const research = { ...baseResearch, lyricsId: "other-lyrics" } as LyricsResearch;

      await expect(callGenerate({ research })).rejects.toMatchObject({
        code: "TRANSLATION_PRECONDITION",
      });
    });

    it("throws TRANSLATION_INVALID_TARGET when targetLanguage lacks region", async () => {
      await expect(callGenerate({ targetLanguage: "pt" })).rejects.toMatchObject({
        code: "TRANSLATION_INVALID_TARGET",
        statusCode: 400,
      });
    });
  });

  describe("generate (idempotency)", () => {
    it("returns existing translation without calling AI when provenance matches", async () => {
      const existing = await buildExistingTranslation();
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(existing as never);

      const result = await callGenerate();

      expect(result).toEqual(existing);
      expect(generateTextMock).not.toHaveBeenCalled();
      expect(prisma.translation.create).not.toHaveBeenCalled();
      expect(prisma.translation.update).not.toHaveBeenCalled();
    });

    it("regenerates and updates when promptVersion is stale", async () => {
      const existing = await buildExistingTranslation();
      const stale = { ...existing, promptVersion: "translation-v0" };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.update).mockResolvedValue({
        ...stale,
        promptVersion: PROMPT_VERSION,
      } as never);

      await callGenerate();

      expect(generateTextMock).toHaveBeenCalledOnce();
      expect(prisma.translation.update).toHaveBeenCalledOnce();
      expect(prisma.translation.create).not.toHaveBeenCalled();
      const updateCall = vi.mocked(prisma.translation.update).mock.calls[0]?.[0];
      expect(updateCall?.data).toMatchObject({
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        sourceContentHash: contentHash,
        status: "FRESH",
      });
    });

    it("regenerates when sourceContentHash changes", async () => {
      const existing = await buildExistingTranslation();
      const stale = { ...existing, sourceContentHash: "old-hash" };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.update).mockResolvedValue(stale as never);

      await callGenerate();

      expect(prisma.translation.update).toHaveBeenCalledOnce();
    });

    it("regenerates when researchVersion changes", async () => {
      const existing = await buildExistingTranslation();
      const stale = { ...existing, researchVersion: "old-research-version" };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.update).mockResolvedValue(stale as never);

      await callGenerate();

      expect(prisma.translation.update).toHaveBeenCalledOnce();
    });
  });

  describe("generate (fresh)", () => {
    it("calls AI and creates a new translation when none exists", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate();

      expect(generateTextMock).toHaveBeenCalledOnce();
      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        language: "pt-BR",
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        sourceContentHash: contentHash,
        status: "FRESH",
        track: { connect: { id: trackId } },
      });
      expect(createCall?.data.researchVersion).toEqual(await computeResearchVersion(baseResearch));
    });

    it("canonicalizes targetLanguage before persisting", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ targetLanguage: "PT-br" });

      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      expect(createCall?.data.language).toBe("pt-BR");
    });

    it("passes the system prompt with anthropic cacheControl", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate();

      const callArgs = generateTextMock.mock.calls[0]?.[0];
      expect(callArgs?.system?.role).toBe("system");
      expect(callArgs?.system?.providerOptions?.anthropic?.cacheControl).toEqual({
        ttl: "1h",
        type: "ephemeral",
      });
    });
  });

  describe("generate (validation)", () => {
    it("throws TRANSLATION_SEGMENT_MISMATCH when segment count differs from source line count", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      const tooFew = buildOutput();
      tooFew.segments = tooFew.segments.slice(0, 3);
      generateTextMock.mockResolvedValue({ output: tooFew });

      await expect(callGenerate()).rejects.toMatchObject({
        code: "TRANSLATION_SEGMENT_MISMATCH",
        statusCode: 502,
      });
      expect(prisma.translation.create).not.toHaveBeenCalled();
    });

    it("throws TRANSLATION_SEGMENT_MISMATCH when indices are not contiguous from 0", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      const bad = buildOutput();
      bad.segments[2] = { ...bad.segments[2]!, index: 99 };
      generateTextMock.mockResolvedValue({ output: bad });

      await expect(callGenerate()).rejects.toMatchObject({
        code: "TRANSLATION_SEGMENT_MISMATCH",
      });
    });
  });

  describe("generate (failure paths)", () => {
    it("maps NoObjectGeneratedError to AppError(502, TRANSLATION_PARSE_ERROR)", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      const error = Object.assign(new Error("bad output"), { cause: "schema", text: "{}" });
      generateTextMock.mockRejectedValue(error);
      noObjectIsInstanceMock.mockImplementation((e) => e === error);

      await expect(callGenerate()).rejects.toThrow(AppError);
      await expect(callGenerate()).rejects.toMatchObject({
        code: "TRANSLATION_PARSE_ERROR",
        statusCode: 502,
      });
      expect(prisma.translation.create).not.toHaveBeenCalled();
    });

    it("maps generic AI errors to AppError(502, TRANSLATION_UPSTREAM_ERROR)", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockRejectedValue(new Error("network down"));

      await expect(callGenerate()).rejects.toMatchObject({
        code: "TRANSLATION_UPSTREAM_ERROR",
        statusCode: 502,
      });
    });

    it("returns existing row when create races with P2002", async () => {
      const existing = await buildExistingTranslation();
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.translation.findUniqueOrThrow).mockResolvedValue(existing as never);

      const result = await callGenerate();

      expect(result).toEqual(existing);
      expect(prisma.translation.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { trackId_language: { language: "pt-BR", trackId } },
      });
    });

    it("wraps generic persist failures as AppError(500, TRANSLATION_PERSIST_ERROR)", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockRejectedValue(new Error("DB connection lost"));

      await expect(callGenerate()).rejects.toMatchObject({
        code: "TRANSLATION_PERSIST_ERROR",
        statusCode: 500,
      });
    });
  });

  describe("findByTrackAndLanguage", () => {
    it("returns the row when found", async () => {
      const existing = await buildExistingTranslation();
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(existing as never);

      const result = await service.findByTrackAndLanguage(trackId, "pt-BR");

      expect(result).toEqual(existing);
      expect(prisma.translation.findUnique).toHaveBeenCalledWith({
        where: { trackId_language: { language: "pt-BR", trackId } },
      });
    });

    it("canonicalizes the language before lookup", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);

      await service.findByTrackAndLanguage(trackId, "PT-br");

      expect(prisma.translation.findUnique).toHaveBeenCalledWith({
        where: { trackId_language: { language: "pt-BR", trackId } },
      });
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);

      const result = await service.findByTrackAndLanguage(trackId, "pt-BR");

      expect(result).toBeNull();
    });

    it("wraps DB errors as AppError(500, TRANSLATION_FETCH_ERROR)", async () => {
      vi.mocked(prisma.translation.findUnique).mockRejectedValue(new Error("DB down"));

      await expect(service.findByTrackAndLanguage(trackId, "pt-BR")).rejects.toMatchObject({
        code: "TRANSLATION_FETCH_ERROR",
        statusCode: 500,
      });
    });
  });

  describe("computeResearchVersion", () => {
    it("is deterministic across identical inputs", async () => {
      const a = await computeResearchVersion(baseResearch);
      const b = await computeResearchVersion({ ...baseResearch });
      expect(a).toBe(b);
    });

    it("changes when any provenance field changes", async () => {
      const base = await computeResearchVersion(baseResearch);
      const otherModel = await computeResearchVersion({
        ...baseResearch,
        modelId: "different-model",
      });
      const otherPrompt = await computeResearchVersion({
        ...baseResearch,
        promptVersion: "research-v2",
      });
      const otherHash = await computeResearchVersion({
        ...baseResearch,
        sourceContentHash: "different-hash",
      });

      expect(otherModel).not.toBe(base);
      expect(otherPrompt).not.toBe(base);
      expect(otherHash).not.toBe(base);
    });
  });
});
