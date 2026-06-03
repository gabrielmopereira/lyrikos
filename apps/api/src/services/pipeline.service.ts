import type { Lyrics, LyricsResearch, Track, Translation } from "@repo/db";

import { isUntranslatableBaseLanguage } from "@/lib/language";
import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";
import { lrclibService } from "@/services/lrclib.service";
import {
  MODEL_ID as RESEARCH_MODEL_ID,
  PROMPT_VERSION as RESEARCH_PROMPT_VERSION,
} from "@/services/lyrics-research.prompt";
import { lyricsResearchService } from "@/services/lyrics-research.service";
import { lyricsService } from "@/services/lyrics.service";
import { translationService } from "@/services/translation.service";

export type PipelinePhase = "lyrics" | "research" | "translation";

export type PipelinePhaseError = { code: string; message: string };

export type PipelineEvent =
  | { data: Lyrics; phase: "lyrics"; status: "cached" | "done" }
  | { data: Translation; phase: "translation"; status: "cached" | "done" }
  | { error: PipelinePhaseError; phase: PipelinePhase; status: "failed" }
  | { phase: "research"; status: "cached" | "done" | "started" }
  | { phase: "research"; reason: string; status: "skipped" }
  | { phase: "translation"; reason: string; status: "skipped" }
  | { phase: PipelinePhase; status: "started" };

const toPhaseError = (error: unknown): PipelinePhaseError => {
  if (error instanceof AppError) {
    return { code: error.code ?? "APP_ERROR", message: error.message };
  }

  if (error instanceof Error) {
    return { code: "UNKNOWN_ERROR", message: error.message };
  }

  return { code: "UNKNOWN_ERROR", message: "Unknown error" };
};

export class PipelineService {
  async *run({
    targetLanguage,
    track,
  }: {
    targetLanguage: string;
    track: Track;
  }): AsyncGenerator<PipelineEvent> {
    const lyrics = yield* this.runLyricsPhase(track);

    if (!lyrics) {
      return;
    }

    if (lyrics.status !== "AVAILABLE") {
      const reason = `lyrics_${lyrics.status.toLowerCase()}`;
      yield { phase: "research", reason, status: "skipped" };
      yield { phase: "translation", reason, status: "skipped" };

      return;
    }

    const research = yield* this.runResearchPhase(lyrics, track);

    if (!research) {
      return;
    }

    // Research may have backfilled lyrics.language — re-read to pick up the change.
    const refreshedLyrics = (await lyricsService.findByTrack(track.id)) ?? lyrics;

    yield* this.runTranslationPhase({
      lyrics: refreshedLyrics,
      research,
      targetLanguage,
      track,
    });
  }

  private async *runLyricsPhase(track: Track): AsyncGenerator<PipelineEvent, Lyrics | null> {
    const existing = await lyricsService.findByTrack(track.id);

    const isNew = !existing;

    if (existing && existing.fetchedAt) {
      yield { data: existing, phase: "lyrics", status: "cached" };
      return existing;
    }

    yield { phase: "lyrics", status: "started" };

    try {
      const result = await lrclibService.getLyrics(
        track.title,
        track.artistName,
        track.albumName,
        track.duration,
      );

      let lyrics: Lyrics | null = null;

      if (isNew) {
        lyrics = await lyricsService.create({ result, trackId: track.id });
        logger.info({ trackId: track.id }, "Lyrics created successfully");
      } else {
        lyrics = await lyricsService.update({ result, trackId: track.id });
        logger.info({ trackId: track.id }, "Lyrics updated successfully");
      }

      yield { data: lyrics, phase: "lyrics", status: "done" };
      return lyrics;
    } catch (error) {
      logger.error({ error, trackId: track.id }, "Pipeline lyrics phase failed");

      yield { error: toPhaseError(error), phase: "lyrics", status: "failed" };
      return null;
    }
  }

  private async *runResearchPhase(
    lyrics: Lyrics,
    track: Track,
  ): AsyncGenerator<PipelineEvent, LyricsResearch | null> {
    const existing = await lyricsResearchService.findByLyricsId(lyrics.id);

    const isCurrent =
      existing !== null &&
      existing.modelId === RESEARCH_MODEL_ID &&
      existing.promptVersion === RESEARCH_PROMPT_VERSION &&
      existing.sourceContentHash === lyrics.contentHash;

    if (isCurrent) {
      yield { phase: "research", status: "cached" };
      return existing;
    }

    yield { phase: "research", status: "started" };

    try {
      const research = await lyricsResearchService.generate({ lyrics, track });

      yield { phase: "research", status: "done" };
      return research;
    } catch (error) {
      logger.error(
        { error, lyricsId: lyrics.id, trackId: track.id },
        "Pipeline research phase failed",
      );

      yield { error: toPhaseError(error), phase: "research", status: "failed" };
      return null;
    }
  }

  private async *runTranslationPhase({
    lyrics,
    research,
    targetLanguage,
    track,
  }: {
    lyrics: Lyrics;
    research: LyricsResearch;
    targetLanguage: string;
    track: Track;
  }): AsyncGenerator<PipelineEvent> {
    const scope = translationService.resolveScope(lyrics, targetLanguage);

    if (scope.kind === "skip") {
      const reason = isUntranslatableBaseLanguage(lyrics.language ?? "")
        ? "no_translatable_content"
        : "languages_mutually_intelligible";

      yield { phase: "translation", reason, status: "skipped" };
      return;
    }

    const existing = await translationService.findByTrackAndLanguage(track.id, targetLanguage);

    if (existing && (await translationService.isCurrent(existing, lyrics, research))) {
      yield { data: existing, phase: "translation", status: "cached" };
      return;
    }

    yield { phase: "translation", status: "started" };

    try {
      const translation = await translationService.generate({
        lyrics,
        research,
        scope,
        targetLanguage,
        track,
      });

      yield { data: translation, phase: "translation", status: "done" };
    } catch (error) {
      logger.error(
        { error, lyricsId: lyrics.id, targetLanguage, trackId: track.id },
        "Pipeline translation phase failed",
      );

      yield { error: toPhaseError(error), phase: "translation", status: "failed" };
    }
  }
}

export const pipelineService = new PipelineService();
