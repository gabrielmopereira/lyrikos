import { beforeEach, describe, expect, it, vi } from "vitest";

const { lrclibServiceMock, lyricsResearchServiceMock, lyricsServiceMock, translationServiceMock } =
  vi.hoisted(() => ({
    lrclibServiceMock: { getLyrics: vi.fn() },
    lyricsResearchServiceMock: { findByLyricsId: vi.fn(), generate: vi.fn() },
    lyricsServiceMock: { create: vi.fn(), findByTrack: vi.fn() },
    translationServiceMock: {
      findByTrackAndLanguage: vi.fn(),
      generate: vi.fn(),
      isLanguagePairRedundant: vi.fn(),
    },
  }));

vi.mock("@/services/lyrics.service", () => ({ lyricsService: lyricsServiceMock }));
vi.mock("@/services/lyrics-research.service", () => ({
  lyricsResearchService: lyricsResearchServiceMock,
}));
vi.mock("@/services/translation.service", () => ({
  translationService: translationServiceMock,
}));
vi.mock("@/services/lrclib.service", () => ({ lrclibService: lrclibServiceMock }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "fake-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "fake-key",
    NODE_ENV: "test",
  },
}));

import { AppError } from "@/middleware/error-handler";
import {
  MODEL_ID as RESEARCH_MODEL_ID,
  PROMPT_VERSION as RESEARCH_PROMPT_VERSION,
} from "@/services/lyrics-research.prompt";

import { PipelineService, type PipelineEvent } from "./pipeline.service";

const collect = async <T>(iter: AsyncGenerator<T>): Promise<Array<T>> => {
  const out: Array<T> = [];
  for await (const v of iter) {
    out.push(v);
  }
  return out;
};

const trackId = "track-1";
const lyricsId = "lyrics-1";
const contentHash = "hash-1";

const baseTrack = {
  albumCover: "https://example.com/cover.jpg",
  albumId: "album-1",
  albumName: "Album",
  artistId: "artist-1",
  artistName: "Artist",
  createdAt: new Date(),
  duration: 200,
  explicitLyrics: false,
  id: trackId,
  isrc: "isrc",
  shortTitle: "Short",
  title: "Title",
  updatedAt: new Date(),
};

const baseLyrics = {
  attemptCount: 1,
  contentHash,
  createdAt: new Date(),
  errorMessage: null,
  fetchedAt: new Date(),
  id: lyricsId,
  language: "en-US",
  lastAttemptAt: new Date(),
  plainLyrics: "line one\nline two",
  status: "AVAILABLE",
  syncedLyrics: null,
  trackId,
  updatedAt: new Date(),
};

const baseResearch = {
  createdAt: new Date(),
  generatedAt: new Date(),
  id: "research-1",
  lyricsId,
  modelId: RESEARCH_MODEL_ID,
  notes: {},
  promptVersion: RESEARCH_PROMPT_VERSION,
  sourceContentHash: contentHash,
  summary: "summary",
  updatedAt: new Date(),
};

const baseTranslation = {
  createdAt: new Date(),
  downvotes: 0,
  generatedAt: new Date(),
  id: "translation-1",
  language: "pt-BR",
  modelId: "claude-sonnet-4-6",
  promptVersion: "translation-v1",
  researchVersion: "rv",
  segments: [],
  selfScore: 0.9,
  sourceContentHash: contentHash,
  status: "FRESH",
  trackId,
  translatorNote: null,
  updatedAt: new Date(),
  upvotes: 0,
};

const service = new PipelineService();
const phases = (events: Array<PipelineEvent>) => events.map((e) => `${e.phase}:${e.status}`);

describe("PipelineService.run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationServiceMock.isLanguagePairRedundant.mockReturnValue(false);
  });

  it("emits three cached events when every phase is warm", async () => {
    lyricsServiceMock.findByTrack.mockResolvedValue(baseLyrics);
    lyricsResearchServiceMock.findByLyricsId.mockResolvedValue(baseResearch);
    translationServiceMock.findByTrackAndLanguage.mockResolvedValue(baseTranslation);

    const events = await collect(service.run({ targetLanguage: "pt-BR", track: baseTrack }));

    expect(phases(events)).toEqual(["lyrics:cached", "research:cached", "translation:cached"]);
    expect(lyricsServiceMock.create).not.toHaveBeenCalled();
    expect(lyricsResearchServiceMock.generate).not.toHaveBeenCalled();
    expect(translationServiceMock.generate).not.toHaveBeenCalled();
  });

  it("runs all phases on a fully cold start", async () => {
    lyricsServiceMock.findByTrack.mockResolvedValueOnce(null).mockResolvedValueOnce(baseLyrics);
    lrclibServiceMock.getLyrics.mockResolvedValue({
      data: { instrumental: false, plainLyrics: "x" },
      kind: "found",
    });
    lyricsServiceMock.create.mockResolvedValue(baseLyrics);
    lyricsResearchServiceMock.findByLyricsId.mockResolvedValue(null);
    lyricsResearchServiceMock.generate.mockResolvedValue(baseResearch);
    translationServiceMock.findByTrackAndLanguage.mockResolvedValue(null);
    translationServiceMock.generate.mockResolvedValue(baseTranslation);

    const events = await collect(service.run({ targetLanguage: "pt-BR", track: baseTrack }));

    expect(phases(events)).toEqual([
      "lyrics:started",
      "lyrics:done",
      "research:started",
      "research:done",
      "translation:started",
      "translation:done",
    ]);
    expect(lyricsServiceMock.create).toHaveBeenCalledOnce();
    expect(lyricsResearchServiceMock.generate).toHaveBeenCalledOnce();
    expect(translationServiceMock.generate).toHaveBeenCalledOnce();
  });

  it("skips translation when source and target languages are mutually intelligible", async () => {
    lyricsServiceMock.findByTrack.mockResolvedValue(baseLyrics);
    lyricsResearchServiceMock.findByLyricsId.mockResolvedValue(baseResearch);
    translationServiceMock.isLanguagePairRedundant.mockReturnValue(true);

    const events = await collect(service.run({ targetLanguage: "en-GB", track: baseTrack }));

    expect(phases(events)).toEqual(["lyrics:cached", "research:cached", "translation:skipped"]);
    const translation = events.find((e) => e.phase === "translation");
    expect(translation).toMatchObject({
      reason: "languages_mutually_intelligible",
      status: "skipped",
    });
    expect(translationServiceMock.findByTrackAndLanguage).not.toHaveBeenCalled();
    expect(translationServiceMock.generate).not.toHaveBeenCalled();
  });

  it("skips research and translation when lyrics are NOT_FOUND", async () => {
    lyricsServiceMock.findByTrack.mockResolvedValue({ ...baseLyrics, status: "NOT_FOUND" });

    const events = await collect(service.run({ targetLanguage: "pt-BR", track: baseTrack }));

    expect(phases(events)).toEqual(["lyrics:cached", "research:skipped", "translation:skipped"]);
    const research = events.find((e) => e.phase === "research");
    const translation = events.find((e) => e.phase === "translation");
    expect(research).toMatchObject({ reason: "lyrics_not_found", status: "skipped" });
    expect(translation).toMatchObject({ reason: "lyrics_not_found", status: "skipped" });
  });

  it("emits translation:failed and stops on AppError from translation service", async () => {
    lyricsServiceMock.findByTrack.mockResolvedValue(baseLyrics);
    lyricsResearchServiceMock.findByLyricsId.mockResolvedValue(baseResearch);
    translationServiceMock.findByTrackAndLanguage.mockResolvedValue(null);
    translationServiceMock.generate.mockRejectedValue(
      new AppError("upstream broken", 502, true, "TRANSLATION_UPSTREAM_ERROR"),
    );

    const events = await collect(service.run({ targetLanguage: "pt-BR", track: baseTrack }));

    expect(phases(events).at(-1)).toBe("translation:failed");
    const failed = events.at(-1);
    expect(failed).toMatchObject({
      error: { code: "TRANSLATION_UPSTREAM_ERROR", message: "upstream broken" },
      phase: "translation",
      status: "failed",
    });
  });
});
