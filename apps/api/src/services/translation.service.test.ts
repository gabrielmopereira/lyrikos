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

import { logger } from "@/lib/logger";
import { computeResearchVersion } from "@/lib/version";
import { AppError } from "@/middleware/error-handler";

import { MODEL_ID, PROMPT_VERSION } from "./translation.prompt";
import type { TranslationOutput } from "./translation.prompt";
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

const buildOutput = (): TranslationOutput => ({
  segments: [
    { contextNote: null, index: 0, translated: "Linha um", translationNote: null },
    { contextNote: null, index: 1, translated: "Linha dois", translationNote: null },
    { contextNote: null, index: 2, translated: "", translationNote: null },
    { contextNote: null, index: 3, translated: "Linha quatro", translationNote: null },
  ],
  selfScore: 0.9,
  translatorNote: null,
});

// Research that anchors a reference to a specific line, so the translation must
// localize it into that line's contextNote (N1).
const researchWithAnchor = (lineIndex: number) =>
  ({
    ...baseResearch,
    notes: {
      ...(baseResearch.notes as object),
      references: [
        {
          confidence: "high",
          explanation: "A real place.",
          lineIndex,
          surface: "Line",
          type: "place",
        },
      ],
    },
  }) as unknown as LyricsResearch;

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
  sourceLanguageBase: "en",
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

    it("throws RESEARCH_NOTES_INVALID when stored research notes are malformed", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      const research = { ...baseResearch, notes: null } as unknown as LyricsResearch;

      await expect(callGenerate({ research })).rejects.toMatchObject({
        code: "RESEARCH_NOTES_INVALID",
        statusCode: 500,
      });
      // Fails before the AI call — no wasted generation on ungrounded input.
      expect(generateTextMock).not.toHaveBeenCalled();
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

    it("regenerates when the source base language changes", async () => {
      const existing = await buildExistingTranslation();
      const stale = { ...existing, sourceLanguageBase: "es" };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(stale as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.update).mockResolvedValue(stale as never);

      await callGenerate();

      expect(prisma.translation.update).toHaveBeenCalledOnce();
    });

    it("stays current when only the region differs (base unchanged)", async () => {
      // Existing row was made from es-ES; lyrics now read es-MX. Base is still
      // 'es', so the translation must NOT regenerate.
      const existing = await buildExistingTranslation();
      const sameBase = { ...existing, sourceLanguageBase: "es" };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(sameBase as never);

      const result = await callGenerate({
        lyrics: { ...baseLyrics, language: "es-MX" } as Lyrics,
        targetLanguage: "pt-BR",
      });

      expect(result).toEqual(sameBase);
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    it("treats a legacy null sourceLanguageBase as current (no force regenerate)", async () => {
      const existing = await buildExistingTranslation();
      const legacy = { ...existing, sourceLanguageBase: null };
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(legacy as never);

      const result = await callGenerate();

      expect(result).toEqual(legacy);
      expect(generateTextMock).not.toHaveBeenCalled();
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

    it("caches the invariant user-message prefix and isolates target language in the suffix", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate();

      const callArgs = generateTextMock.mock.calls[0]?.[0];
      const content = callArgs?.messages?.[0]?.content;
      expect(Array.isArray(content)).toBe(true);

      const [prefixPart, suffixPart] = content;
      // The large, per-track-invariant block carries the cache breakpoint so it
      // is reused across every target language for the same track.
      expect(prefixPart?.providerOptions?.anthropic?.cacheControl).toEqual({
        ttl: "1h",
        type: "ephemeral",
      });
      expect(prefixPart?.text).toContain("## Research notes");
      // The only varying instruction lives after the cache breakpoint.
      expect(suffixPart?.providerOptions).toBeUndefined();
      expect(suffixPart?.text).toContain("pt-BR");
      expect(prefixPart?.text).not.toContain("Target language");
    });

    it("persists the source base language on the new row", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate();

      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      expect(createCall?.data.sourceLanguageBase).toBe("en");
    });

    it("builds a partial-mode suffix listing foreign indices while keeping the cached prefix", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ scope: { kind: "partial", lineIndices: [3] } });

      const callArgs = generateTextMock.mock.calls[0]?.[0];
      const content = callArgs?.messages?.[0]?.content;
      const [prefixPart, suffixPart] = content;
      // Suffix carries the partial instruction with the specific indices.
      expect(suffixPart?.text).toContain("[3]");
      expect(suffixPart?.text).toContain("contextNote");
      // Prefix is byte-identical to full mode, so the prompt cache still hits.
      expect(prefixPart?.text).toContain("## Research notes");
      expect(prefixPart?.text).not.toContain("Target language");
    });

    it("forces passthrough lines to null and keeps only the foreign line translated", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      // Model echoes the original for passthrough lines; the service must override it.
      const echoed = buildOutput();
      echoed.segments[0] = { ...echoed.segments[0]!, translated: "Line one" };
      generateTextMock.mockResolvedValue({ output: echoed });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ scope: { kind: "partial", lineIndices: [3] } });

      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      const segments = createCall?.data.segments as Array<{
        index: number;
        translated: string | null;
      }>;
      // Foreign line keeps its translation; every other line is nulled.
      expect(segments.find((s) => s.index === 3)?.translated).toBe("Linha quatro");
      expect(segments.find((s) => s.index === 0)?.translated).toBeNull();
      expect(segments.find((s) => s.index === 1)?.translated).toBeNull();
      expect(segments.find((s) => s.index === 2)?.translated).toBeNull();
    });
  });

  describe("generate (context notes)", () => {
    it("stores the contextNote and does not flag drift when the anchored line has one", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      const output = buildOutput();
      output.segments[0] = { ...output.segments[0]!, contextNote: "Sobre a cidade" };
      generateTextMock.mockResolvedValue({ output });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ research: researchWithAnchor(0) });

      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      const segments = createCall?.data.segments as Array<{
        contextNote: string | null;
        index: number;
      }>;
      expect(segments.find((s) => s.index === 0)?.contextNote).toBe("Sobre a cidade");
      expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
    });

    it("warns (without failing) when a research-anchored line returns no contextNote", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      generateTextMock.mockResolvedValue({ output: buildOutput() });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ research: researchWithAnchor(1) });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ missingContextNotes: [1] }),
        "Translation context-note drift: research-anchored lines missing contextNote",
      );
      expect(prisma.translation.create).toHaveBeenCalledOnce();
    });

    it("strips a contextNote the model spreads onto a non-anchored repeated line", async () => {
      vi.mocked(prisma.translation.findUnique).mockResolvedValue(null as never);
      // Research anchors only line 0. The model localizes it there (correct) but
      // also propagates the same note onto the identical repeat at line 1 (the bug).
      const output = buildOutput();
      output.segments[0] = { ...output.segments[0]!, contextNote: "Sobre a cidade" };
      output.segments[1] = { ...output.segments[1]!, contextNote: "Sobre a cidade" };
      generateTextMock.mockResolvedValue({ output });
      vi.mocked(prisma.translation.create).mockResolvedValue(
        (await buildExistingTranslation()) as never,
      );

      await callGenerate({ research: researchWithAnchor(0) });

      const createCall = vi.mocked(prisma.translation.create).mock.calls[0]?.[0];
      const segments = createCall?.data.segments as Array<{
        contextNote: string | null;
        index: number;
      }>;
      // Anchored line keeps its note; the stray note on the unanchored repeat is nulled.
      expect(segments.find((s) => s.index === 0)?.contextNote).toBe("Sobre a cidade");
      expect(segments.find((s) => s.index === 1)?.contextNote).toBeNull();
      // The anchored line had its note, so no drift warning fires.
      expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
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

  describe("resolveScope", () => {
    it("returns skip when the only language is intelligible with the target", () => {
      const lyrics = { ...baseLyrics, secondaryLanguages: null } as unknown as Lyrics;
      expect(service.resolveScope(lyrics, "en-GB")).toEqual({ kind: "skip" });
    });

    it("returns full when the primary language differs from the target", () => {
      const lyrics = { ...baseLyrics, secondaryLanguages: null } as unknown as Lyrics;
      expect(service.resolveScope(lyrics, "pt-BR")).toEqual({ kind: "full" });
    });

    it("returns partial with the foreign line indices read from secondaryLanguages", () => {
      const lyrics = {
        ...baseLyrics,
        secondaryLanguages: [{ language: "fr-FR", lineIndices: [3] }],
      } as unknown as Lyrics;

      expect(service.resolveScope(lyrics, "en-US")).toEqual({ kind: "partial", lineIndices: [3] });
    });
  });

  describe("isCurrent", () => {
    it("returns true when provenance matches", async () => {
      const existing = await buildExistingTranslation();
      expect(await service.isCurrent(existing as never, baseLyrics, baseResearch)).toBe(true);
    });

    it("returns false when the prompt version is stale", async () => {
      const existing = { ...(await buildExistingTranslation()), promptVersion: "translation-v0" };
      expect(await service.isCurrent(existing as never, baseLyrics, baseResearch)).toBe(false);
    });

    it("returns false when the source language is unknown", async () => {
      const existing = await buildExistingTranslation();
      const lyrics = { ...baseLyrics, language: null } as Lyrics;
      expect(await service.isCurrent(existing as never, lyrics, baseResearch)).toBe(false);
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
