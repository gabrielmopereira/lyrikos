import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@repo/db";
import type { Lyrics, LyricsResearch, Prisma, Translation } from "@repo/db";
import { Output, generateText } from "ai";

import { describeAiError } from "@/lib/ai-errors";
import {
  canonicalizeLanguageTag,
  getBaseLanguage,
  isRegionSpecificLanguageTag,
  resolveTranslationScope,
} from "@/lib/language";
import type { SecondaryLanguage, TranslationScope } from "@/lib/language";
import { logger } from "@/lib/logger";
import { computeResearchVersion } from "@/lib/version";
import { AppError, isPrismaKnownError } from "@/middleware/error-handler";
import {
  MODEL_ID,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
  researchNotesForPromptSchema,
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
  scope?: TranslationScope;
  targetLanguage: string;
  track: TranslationTrackInput;
  trackContext?: string | null;
};

const collectAnchoredLineIndices = (
  notes: ResearchNotesForPrompt,
  lineCount: number,
): Set<number> => {
  const anchored = new Set<number>();
  const items = [...(notes.references ?? []), ...(notes.idioms ?? []), ...(notes.wordplay ?? [])];

  for (const item of items) {
    const index = item.lineIndex;

    if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < lineCount) {
      anchored.add(index);
    }
  }

  return anchored;
};

const isTranslationRowCurrent = (
  existing: Translation,
  expected: {
    modelId: string;
    promptVersion: string;
    researchVersion: string;
    sourceContentHash: string | null;
    sourceLanguageBase: string;
  },
): boolean =>
  existing.modelId === expected.modelId &&
  existing.promptVersion === expected.promptVersion &&
  existing.sourceContentHash === expected.sourceContentHash &&
  existing.researchVersion === expected.researchVersion &&
  (existing.sourceLanguageBase === null ||
    existing.sourceLanguageBase === expected.sourceLanguageBase);

export class TranslationService {
  resolveScope(lyrics: Lyrics, target: string): TranslationScope {
    const secondary = (lyrics.secondaryLanguages as Array<SecondaryLanguage> | null) ?? [];
    return resolveTranslationScope(lyrics.language ?? "", secondary, target);
  }

  async isCurrent(
    existing: Translation,
    lyrics: Lyrics,
    research: LyricsResearch,
  ): Promise<boolean> {
    if (!lyrics.language) {
      return false;
    }

    return isTranslationRowCurrent(existing, {
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      researchVersion: await computeResearchVersion(research),
      sourceContentHash: lyrics.contentHash,
      sourceLanguageBase: getBaseLanguage(lyrics.language),
    });
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
    scope = { kind: "full" },
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
    const sourceLanguageBase = getBaseLanguage(lyrics.language);
    const researchVersion = await computeResearchVersion(research);

    const sourceLineCount = lyrics.plainLyrics.split("\n").length;

    const existing = await prisma.translation.findUnique({
      where: { trackId_language: { language: canonicalTarget, trackId: lyrics.trackId } },
    });

    const isCurrent =
      existing !== null &&
      isTranslationRowCurrent(existing, {
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        researchVersion,
        sourceContentHash,
        sourceLanguageBase,
      });

    if (isCurrent) {
      logger.info(
        { language: canonicalTarget, trackId: lyrics.trackId, translationId: existing.id },
        "Translation already current; skipping AI call",
      );
      return existing;
    }

    const parsedNotes = researchNotesForPromptSchema.safeParse(research.notes);

    if (!parsedNotes.success) {
      logger.error(
        { error: parsedNotes.error, language: canonicalTarget, lyricsId: lyrics.id },
        "Stored research notes failed validation; refusing to translate without grounding",
      );
      throw new AppError(
        "Stored research notes are malformed",
        500,
        false,
        "RESEARCH_NOTES_INVALID",
      );
    }

    const researchNotes = parsedNotes.data;

    const { cachedPrefix, variableSuffix } = buildUserPrompt({
      lyrics: { plainLyrics: lyrics.plainLyrics },
      research: {
        notes: researchNotes,
        summary: research.summary,
      },
      scope,
      sourceLanguage: canonicalSource,
      targetLanguage: canonicalTarget,
      track,
      trackContext,
    });

    let output: TranslationOutput;

    try {
      const result = await generateText({
        messages: [
          {
            content: [
              {
                providerOptions: {
                  anthropic: { cacheControl: { ttl: "1h", type: "ephemeral" } },
                },
                text: cachedPrefix,
                type: "text",
              },
              { text: variableSuffix, type: "text" },
            ],
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

    const foreignLineIndices = new Set(scope.kind === "partial" ? scope.lineIndices : []);

    const anchoredLineIndices = collectAnchoredLineIndices(researchNotes, sourceLineCount);

    const segments = output.segments.map((segment) => {
      const translated =
        scope.kind === "partial" && !foreignLineIndices.has(segment.index)
          ? null
          : segment.translated;
      const contextNote = anchoredLineIndices.has(segment.index) ? segment.contextNote : null;

      return { ...segment, contextNote, translated };
    });

    const missingContextNotes = [...anchoredLineIndices].filter(
      (index) => !segments[index]?.contextNote,
    );

    if (missingContextNotes.length > 0) {
      logger.warn(
        {
          anchoredLineIndices: [...anchoredLineIndices],
          language: canonicalTarget,
          lyricsId: lyrics.id,
          missingContextNotes,
        },
        "Translation context-note drift: research-anchored lines missing contextNote",
      );
    }

    const generatedAt = new Date();
    const data = {
      downvotes: 0,
      generatedAt,
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      researchVersion,
      segments,
      selfScore: output.selfScore,
      sourceContentHash,
      sourceLanguageBase,
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
