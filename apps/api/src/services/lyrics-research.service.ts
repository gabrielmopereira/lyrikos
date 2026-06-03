import { google } from "@ai-sdk/google";
import { prisma } from "@repo/db";
import type { Lyrics, LyricsResearch } from "@repo/db";
import { Output, generateText, stepCountIs } from "ai";

import { describeAiError } from "@/lib/ai-errors";
import { ensureRegionSubtag, getBaseLanguage, isUntranslatableBaseLanguage } from "@/lib/language";
import { logger } from "@/lib/logger";
import { AppError, isPrismaKnownError } from "@/middleware/error-handler";
import {
  MODEL_ID,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
  researchNotesSchema,
} from "@/services/lyrics-research.prompt";
import type { ResearchNotes } from "@/services/lyrics-research.prompt";

const isLineIndexInRange = (value: number, lineCount: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < lineCount;

const clampLineAnchor = (value: number | null, lineCount: number): number | null =>
  value !== null && isLineIndexInRange(value, lineCount) ? value : null;

const sanitizeResearchLineIndices = (notes: ResearchNotes, lineCount: number): ResearchNotes => {
  const primaryBase = getBaseLanguage(notes.detectedLanguage);
  const seenSecondaryBases = new Set<string>();

  return {
    ...notes,
    idioms: notes.idioms.map((item) => ({
      ...item,
      lineIndex: clampLineAnchor(item.lineIndex, lineCount),
    })),
    references: notes.references.map((item) => ({
      ...item,
      lineIndex: clampLineAnchor(item.lineIndex, lineCount),
    })),
    secondaryLanguages: notes.secondaryLanguages
      .map((entry) => ({
        ...entry,
        lineIndices: entry.lineIndices.filter((index) => isLineIndexInRange(index, lineCount)),
      }))
      .filter((entry) => {
        const base = getBaseLanguage(entry.language);

        if (base === primaryBase || seenSecondaryBases.has(base)) {
          return false;
        }

        seenSecondaryBases.add(base);
        return true;
      }),
    wordplay: notes.wordplay.map((item) => ({
      ...item,
      lineIndex: clampLineAnchor(item.lineIndex, lineCount),
    })),
  };
};

export class LyricsResearchService {
  async findByLyricsId(lyricsId: string) {
    try {
      return await prisma.lyricsResearch.findUnique({ where: { lyricsId } });
    } catch (error) {
      logger.error({ error, lyricsId }, "Failed to find lyrics research");
      throw new AppError("Failed to fetch lyrics research", 500, false, "RESEARCH_FETCH_ERROR");
    }
  }

  async generate({
    lyrics,
    track,
  }: {
    lyrics: Lyrics;
    track: { albumName: string; artistName: string; title: string };
  }): Promise<LyricsResearch> {
    if (lyrics.status !== "AVAILABLE" || !lyrics.plainLyrics || !lyrics.contentHash) {
      throw new AppError(
        "Cannot research lyrics: must be AVAILABLE with plainLyrics and contentHash",
        400,
        false,
        "RESEARCH_PRECONDITION",
      );
    }

    const sourceContentHash = lyrics.contentHash;
    const plainLyrics = lyrics.plainLyrics;

    const existing = await prisma.lyricsResearch.findUnique({
      where: { lyricsId: lyrics.id },
    });

    const isCurrent =
      existing &&
      existing.modelId === MODEL_ID &&
      existing.promptVersion === PROMPT_VERSION &&
      existing.sourceContentHash === sourceContentHash;

    if (isCurrent) {
      logger.info(
        { lyricsId: lyrics.id, researchId: existing.id },
        "Lyrics research already current; skipping AI call",
      );

      return existing;
    }

    let notes: ResearchNotes;

    try {
      const { output } = await generateText({
        model: google(MODEL_ID),
        output: Output.object({ schema: researchNotesSchema }),
        prompt: buildUserPrompt({
          albumName: track.albumName,
          artistName: track.artistName,
          plainLyrics,
          title: track.title,
        }),
        stopWhen: stepCountIs(8),
        system: SYSTEM_PROMPT,
        tools: {
          google_search: google.tools.googleSearch({}),
        },
      });

      notes = output;
    } catch (error) {
      const info = describeAiError(error);

      if (info.kind === "schema") {
        logger.error(
          { ...info, lyricsId: lyrics.id },
          "AI returned an output that did not match the research schema",
        );
        throw new AppError("Failed to parse research output", 502, true, "RESEARCH_PARSE_ERROR");
      }

      logger.error({ ...info, lyricsId: lyrics.id }, "Lyrics research AI call failed");
      throw new AppError("Lyrics research failed", 502, true, "RESEARCH_UPSTREAM_ERROR");
    }

    notes = sanitizeResearchLineIndices(notes, plainLyrics.split("\n").length);

    const { summary, ...restNotes } = notes;
    const generatedAt = new Date();

    let saved: LyricsResearch;

    try {
      saved = existing
        ? await prisma.lyricsResearch.update({
            data: {
              generatedAt,
              modelId: MODEL_ID,
              notes: restNotes,
              promptVersion: PROMPT_VERSION,
              sourceContentHash,
              summary,
            },
            where: { lyricsId: lyrics.id },
          })
        : await prisma.lyricsResearch.create({
            data: {
              generatedAt,
              lyricsId: lyrics.id,
              modelId: MODEL_ID,
              notes: restNotes,
              promptVersion: PROMPT_VERSION,
              sourceContentHash,
              summary,
            },
          });
    } catch (error) {
      if (isPrismaKnownError(error) && error.code === "P2002") {
        const winner = await prisma.lyricsResearch.findUniqueOrThrow({
          where: { lyricsId: lyrics.id },
        });

        logger.info(
          { lyricsId: lyrics.id, researchId: winner.id },
          "Lyrics research race resolved via P2002",
        );
        return winner;
      }

      logger.error({ error, lyricsId: lyrics.id }, "Failed to persist lyrics research");
      throw new AppError("Failed to persist lyrics research", 500, false, "RESEARCH_PERSIST_ERROR");
    }

    if (notes.detectedLanguage) {
      const language = isUntranslatableBaseLanguage(notes.detectedLanguage)
        ? "und"
        : ensureRegionSubtag(notes.detectedLanguage);

      try {
        await prisma.lyrics.update({
          data: {
            language,
            secondaryLanguages: notes.secondaryLanguages,
          },
          where: { id: lyrics.id },
        });
      } catch (error) {
        logger.warn(
          { detectedLanguage: notes.detectedLanguage, error, lyricsId: lyrics.id },
          "Failed to backfill Lyrics language fields",
        );
      }
    }

    logger.info({ lyricsId: lyrics.id, researchId: saved.id }, "Lyrics research created");
    return saved;
  }
}

export const lyricsResearchService = new LyricsResearchService();
