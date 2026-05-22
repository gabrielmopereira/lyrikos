import type { Lyrics, LyricsResearch, Track, Translation } from "@repo/db";

import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";
import type { DeezerTrackResponse } from "@/services/deezer.service";
import { deezerService } from "@/services/deezer.service";
import { lrclibService } from "@/services/lrclib.service";
import { lyricsResearchService } from "@/services/lyrics-research.service";
import { lyricsService } from "@/services/lyrics.service";
import { trackService } from "@/services/track.service";
import { translationService } from "@/services/translation.service";

export type PipelinePhase = "lyrics" | "research" | "track" | "translation";

export type PipelinePhaseError = { code: string; message: string };

export type PipelineEvent =
  | { data: Lyrics; phase: "lyrics"; status: "cached" | "done" }
  | { data: Track; phase: "track"; status: "cached" | "done" }
  | { data: Translation; phase: "translation"; status: "cached" | "done" }
  | { error: PipelinePhaseError; phase: PipelinePhase; status: "failed" }
  | { phase: "research"; status: "cached" | "done" | "started" }
  | { phase: "research"; reason: string; status: "skipped" }
  | { phase: "translation"; reason: string; status: "skipped" }
  | { phase: PipelinePhase; status: "started" };

const deezerTrackToCreateInput = (deezerTrack: DeezerTrackResponse) => ({
  albumCover: deezerTrack.album.cover_medium,
  albumId: String(deezerTrack.album.id),
  albumName: deezerTrack.album.title,
  artistId: String(deezerTrack.artist.id),
  artistName: deezerTrack.artist.name,
  duration: deezerTrack.duration,
  explicitLyrics: deezerTrack.explicit_lyrics,
  id: String(deezerTrack.id),
  isrc: deezerTrack.isrc,
  shortTitle: deezerTrack.title_short,
  title: deezerTrack.title,
});

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
    trackId,
  }: {
    targetLanguage: string;
    trackId: string;
  }): AsyncGenerator<PipelineEvent> {
    const track = yield* this.runTrackPhase(trackId);

    if (!track) {
      return;
    }

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
    const refreshedLyrics = (await lyricsService.findByTrackId(track.id)) ?? lyrics;

    yield* this.runTranslationPhase({
      lyrics: refreshedLyrics,
      research,
      targetLanguage,
      track,
    });
  }

  private async *runTrackPhase(trackId: string): AsyncGenerator<PipelineEvent, Track | null> {
    const existing = await trackService.findById(trackId);

    if (existing) {
      yield { data: existing, phase: "track", status: "cached" };
      return existing;
    }

    yield { phase: "track", status: "started" };

    try {
      const deezerTrack = await deezerService.getTrack(trackId);
      const track = await trackService.create(deezerTrackToCreateInput(deezerTrack));

      yield { data: track, phase: "track", status: "done" };
      return track;
    } catch (error) {
      logger.error({ error, trackId }, "Pipeline track phase failed");

      yield { error: toPhaseError(error), phase: "track", status: "failed" };
      return null;
    }
  }

  private async *runLyricsPhase(track: Track): AsyncGenerator<PipelineEvent, Lyrics | null> {
    const existing = await lyricsService.findByTrackId(track.id);

    if (existing) {
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

      const lyrics = await lyricsService.create({ result, trackId: track.id });

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

    if (existing) {
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
    if (
      lyrics.language &&
      translationService.isLanguagePairRedundant(lyrics.language, targetLanguage)
    ) {
      yield {
        phase: "translation",
        reason: "languages_mutually_intelligible",
        status: "skipped",
      };
      return;
    }

    const existing = await translationService.findByTrackAndLanguage(track.id, targetLanguage);

    if (existing) {
      yield { data: existing, phase: "translation", status: "cached" };
      return;
    }

    yield { phase: "translation", status: "started" };

    try {
      const translation = await translationService.generate({
        lyrics,
        research,
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
