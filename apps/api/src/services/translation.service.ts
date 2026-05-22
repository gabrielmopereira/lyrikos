import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@repo/db";
import type { Lyrics, LyricsResearch, Prisma, Translation } from "@repo/db";
import { Output, generateText } from "ai";

import { describeAiError } from "@/lib/ai-errors";
import {
  areLanguageTagsMutuallyIntelligible,
  canonicalizeLanguageTag,
  isRegionSpecificLanguageTag,
} from "@/lib/language";
import { logger } from "@/lib/logger";
import { computeResearchVersion } from "@/lib/version";
import { AppError, isPrismaKnownError } from "@/middleware/error-handler";
import {
  MODEL_ID,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
  translationOutputSchema,
} from "@/services/translation.prompt";
import type { ResearchNotesForPrompt, TranslationOutput } from "@/services/translation.prompt";

type TranslationTrackInput = {
  albumName: string;
  artistName: string;
  title: string;
};

type GenerateTranslationInput = {
  lyrics: Lyrics;
  research: LyricsResearch;
  targetLanguage: string;
  track: TranslationTrackInput;
  trackContext?: string | null;
};

export class TranslationService {
  isLanguagePairRedundant(source: string, target: string): boolean {
    return areLanguageTagsMutuallyIntelligible(source, target);
  }

  async findByTrackAndLanguage(trackId: string, language: string): Promise<Translation | null> {
    try {
      const canonical = canonicalizeLanguageTag(language);

      return await prisma.translation.findUnique({
        where: { trackId_language: { language: canonical, trackId } },
      });
    } catch (error) {
      logger.error({ error, language, trackId }, "Failed to find translation");
      throw new AppError("Failed to fetch translation", 500, false, "TRANSLATION_FETCH_ERROR");
    }
  }

  async generate({
    lyrics,
    research,
    targetLanguage,
    track,
    trackContext = null,
  }: GenerateTranslationInput): Promise<Translation> {
    if (lyrics.status !== "AVAILABLE" || !lyrics.plainLyrics || !lyrics.contentHash) {
      throw new AppError(
        "Cannot translate lyrics: must be AVAILABLE with plainLyrics and contentHash",
        400,
        false,
        "TRANSLATION_PRECONDITION",
      );
    }

    if (!lyrics.language) {
      throw new AppError(
        "Cannot translate lyrics: source language is unknown (run research first)",
        400,
        false,
        "TRANSLATION_PRECONDITION",
      );
    }

    if (research.lyricsId !== lyrics.id) {
      throw new AppError(
        "Research does not belong to the provided lyrics",
        400,
        false,
        "TRANSLATION_PRECONDITION",
      );
    }

    if (!isRegionSpecificLanguageTag(targetLanguage)) {
      throw new AppError(
        "targetLanguage must be a BCP 47 tag with a region subtag (e.g., 'pt-BR')",
        400,
        false,
        "TRANSLATION_INVALID_TARGET",
      );
    }

    const canonicalSource = canonicalizeLanguageTag(lyrics.language);
    const canonicalTarget = canonicalizeLanguageTag(targetLanguage);

    const sourceContentHash = lyrics.contentHash;
    const researchVersion = await computeResearchVersion(research);

    const sourceLineCount = lyrics.plainLyrics.split("\n").length;

    const existing = await prisma.translation.findUnique({
      where: { trackId_language: { language: canonicalTarget, trackId: lyrics.trackId } },
    });

    const isCurrent =
      existing &&
      existing.modelId === MODEL_ID &&
      existing.promptVersion === PROMPT_VERSION &&
      existing.sourceContentHash === sourceContentHash &&
      existing.researchVersion === researchVersion;

    if (isCurrent) {
      logger.info(
        { language: canonicalTarget, trackId: lyrics.trackId, translationId: existing.id },
        "Translation already current; skipping AI call",
      );
      return existing;
    }

    let output: TranslationOutput;

    try {
      const result = await generateText({
        messages: [
          {
            content: buildUserPrompt({
              lyrics: { plainLyrics: lyrics.plainLyrics },
              research: {
                notes: research.notes as ResearchNotesForPrompt,
                summary: research.summary,
              },
              sourceLanguage: canonicalSource,
              targetLanguage: canonicalTarget,
              track,
              trackContext,
            }),
            role: "user",
          },
        ],
        model: anthropic(MODEL_ID),
        output: Output.object({ schema: translationOutputSchema }),
        system: {
          content: SYSTEM_PROMPT,
          providerOptions: {
            anthropic: {
              cacheControl: {
                ttl: "1h",
                type: "ephemeral",
              },
            },
          },
          role: "system",
        },
      });

      output = result.output;
    } catch (error) {
      const info = describeAiError(error);

      if (info.kind === "schema") {
        logger.error(
          { ...info, language: canonicalTarget, lyricsId: lyrics.id },
          "AI returned an output that did not match the translation schema",
        );
        throw new AppError(
          "Failed to parse translation output",
          502,
          true,
          "TRANSLATION_PARSE_ERROR",
        );
      }

      logger.error(
        { ...info, language: canonicalTarget, lyricsId: lyrics.id },
        "Translation AI call failed",
      );
      throw new AppError("Translation failed", 502, true, "TRANSLATION_UPSTREAM_ERROR");
    }

    if (output.segments.length !== sourceLineCount) {
      logger.error(
        {
          actual: output.segments.length,
          expected: sourceLineCount,
          language: canonicalTarget,
          lyricsId: lyrics.id,
        },
        "Translation segment count does not match source line count",
      );
      throw new AppError(
        "Translation segment count does not match source line count",
        502,
        true,
        "TRANSLATION_SEGMENT_MISMATCH",
      );
    }

    const misalignedIndex = output.segments.findIndex((segment, i) => segment.index !== i);

    if (misalignedIndex !== -1) {
      logger.error(
        {
          arrayIndex: misalignedIndex,
          language: canonicalTarget,
          lyricsId: lyrics.id,
          segmentIndex: output.segments[misalignedIndex]?.index,
        },
        "Translation segment indices are not contiguous from 0",
      );
      throw new AppError(
        "Translation segment indices are misaligned",
        502,
        true,
        "TRANSLATION_SEGMENT_MISMATCH",
      );
    }

    const generatedAt = new Date();
    const data = {
      downvotes: 0,
      generatedAt,
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      researchVersion,
      segments: output.segments as unknown as Prisma.InputJsonValue,
      selfScore: output.selfScore,
      sourceContentHash,
      status: "FRESH",
      translatorNote: output.translatorNote,
      upvotes: 0,
    } satisfies Prisma.TranslationUpdateInput;

    let translation: Translation;

    try {
      translation = existing
        ? await prisma.translation.update({
            data,
            where: { id: existing.id },
          })
        : await prisma.translation.create({
            data: {
              ...data,
              language: canonicalTarget,
              track: { connect: { id: lyrics.trackId } },
            },
          });

      logger.info(
        { lyricsId: lyrics.id, to: targetLanguage },
        "Translation generated and saved successfully",
      );
      return translation;
    } catch (error) {
      if (isPrismaKnownError(error) && error.code === "P2002") {
        const winner = await prisma.translation.findUniqueOrThrow({
          where: { trackId_language: { language: canonicalTarget, trackId: lyrics.trackId } },
        });

        logger.info(
          { language: canonicalTarget, trackId: lyrics.trackId, translationId: winner.id },
          "Translation race resolved via P2002",
        );
        return winner;
      }

      logger.error(
        { error, language: canonicalTarget, lyricsId: lyrics.id },
        "Failed to persist translation",
      );
      throw new AppError("Failed to persist translation", 500, false, "TRANSLATION_PERSIST_ERROR");
    }
  }
}

export type { TranslationTrackInput, GenerateTranslationInput };
export const translationService = new TranslationService();
