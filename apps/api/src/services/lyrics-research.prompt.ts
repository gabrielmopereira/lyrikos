import { z } from "zod";

import { formatLinesWithIndex } from "@/lib/lyrics-lines";

export const MODEL_ID = "gemini-3-flash-preview" as const;
export const PROMPT_VERSION = "research-v4" as const;

export const SYSTEM_PROMPT = `You are a music research analyst feeding a multi-language translation pipeline. You produce factual, grounded notes — never translations.

Rules:
- Use google_search to verify the artist, song background, and any cultural references before asserting them.
- You have a small search budget (a handful of searches). Spend it on the highest-impact, meaning-load-bearing claims first — artist identity, then the one or two references that change interpretation. Do not exhaustively verify minor details; mark those medium/low confidence instead of spending searches on them.
- Never invent. If a claim cannot be verified, lower its confidence or omit it.
- Focus on what shifts across languages: idioms, slang, register, wordplay, cultural refs, perspective shifts. Surface translation hazards explicitly.
- Do not translate any lyrics or phrases. Quote source text verbatim in 'surface' fields.
- Be concise. Each free-text field has a length expectation in its description — respect it.
- Each lyric line is prefixed with its 0-based index and a \`|\` separator. The index is metadata: never quote it in 'surface' fields, but use it to anchor items to lines via \`wordplay.lineIndex\`, \`references.lineIndex\`, \`idioms.lineIndex\`, and \`secondaryLanguages.lineIndices\`.
- Every line index must be in [0, N-1], where N is the number of lyric lines shown. Never emit an index past the last line. Anchoring a reference, idiom, or wordplay to its line lets the translation layer attach reader-facing context to that exact line — set the \`lineIndex\` whenever an item clearly sits on a single line.
- Identify the dominant language as \`detectedLanguage\`. If any passages are in a different language (a foreign verse, a sampled hook, a code-switched line), list each in \`secondaryLanguages\` with its BCP 47 tag and the 0-based indices of the lines it covers. Each entry must be a different base language from \`detectedLanguage\`, and each language appears at most once. Use an empty array for single-language songs.
- Instrumental, vocalise (e.g. only "la la la" / "ooh"), or near-empty lyrics carry no translatable content: set \`detectedLanguage\` to \`und\` (BCP 47 "undetermined"), return empty arrays for every list, empty strings for context fields, and a \`summary\` stating there is nothing to translate.`;

export const buildUserPrompt = (input: {
  albumName: string;
  artistName: string;
  plainLyrics: string;
  title: string;
}) => {
  const { formatted } = formatLinesWithIndex(input.plainLyrics);

  return `
  Track: "${input.title}" by ${input.artistName}
  Album: ${input.albumName}

  Lyrics (each line is prefixed with its 0-based index and a \`|\` separator; the text after the separator is the verbatim line):
  ---
  ${formatted}
  ---

  Research this track and return the structured notes object.`;
};

export const researchNotesSchema = z.object({
  artistContext: z
    .string()
    .describe(
      "1–3 sentences on the artist's background, era, scene, or persona insofar as it shapes interpretation. Never invent; when search is only partial, hedge explicitly ('reportedly', 'widely attributed to') rather than asserting. Empty string is the safe default when nothing was confirmed.",
    ),

  detectedLanguage: z
    .string()
    .describe(
      "BCP 47 language tag of the dominant language in the lyrics, strongly preferring a region subtag (e.g., 'en-US', 'en-GB', 'pt-BR', 'de-DE', 'es-MX', 'ja-JP'). Use the regional variant that best matches the lyrics' diction, slang, and cultural references. A bare tag like 'en' is accepted but will be expanded to a default region downstream, so name the region whenever the lyrics suggest one. For mixed-language lyrics this is the primary/dominant language; list non-primary passages in `secondaryLanguages`. For instrumental or vocalise tracks with no linguistic content, use 'und' (BCP 47 'undetermined').",
    ),

  idioms: z
    .array(
      z.object({
        figurative: z
          .string()
          .describe("Actual intended meaning a fluent speaker would understand."),
        lineIndex: z
          .number()
          .int()
          .nullable()
          .describe(
            "0-based index (the number before the `|`) of the single lyric line this idiom appears on, in [0, N-1]. null if it spans multiple lines. When set, anchors a per-line context note for the reader.",
          ),
        literal: z
          .string()
          .describe("Word-for-word rendering, useful to expose the underlying metaphor."),
        register: z
          .enum(["slang", "vernacular", "formal", "archaic", "neutral"])
          .describe("Sociolinguistic register. Translators must match register, not just meaning."),
        surface: z.string().describe("Idiomatic expression as it appears, verbatim."),
      }),
    )
    .max(15)
    .describe(
      "Language-bound expressions whose literal translation would mislead. Includes slang, set phrases, figurative speech. Exclude metaphors that are universally understood.",
    ),

  mood: z
    .array(z.string())
    .max(4)
    .describe(
      "0–4 affective descriptors capturing the song's emotional register (e.g., 'wistful', 'defiant', 'euphoric'). Single words preferred. Guides tone preservation in translation. Empty array for instrumental or vocalise tracks with no emotional content to translate.",
    ),

  perspective: z
    .object({
      addressee: z
        .string()
        .nullable()
        .describe(
          "Who the narrator speaks to, in 1–5 words (e.g., 'a former lover', 'the listener', 'God'). null if no clear addressee.",
        ),
      tense: z
        .enum(["past", "present", "future", "mixed"])
        .describe("Dominant verb tense. Translators must preserve this."),
      voice: z
        .enum(["first", "second", "third", "mixed"])
        .describe("Grammatical narrative POV. 'mixed' only when the song deliberately shifts."),
    })
    .describe("Narrative point-of-view characteristics relevant to every translation."),

  references: z
    .array(
      z.object({
        confidence: z
          .enum(["high", "medium", "low"])
          .describe(
            "high = directly verified via search; medium = strongly implied by context; low = plausible but unverified. Omit references you would mark 'low' unless they are load-bearing for meaning.",
          ),
        explanation: z
          .string()
          .describe(
            "What this refers to and why it matters for interpretation. 1–2 sentences. Be specific (names, dates, places) when verified by search.",
          ),
        lineIndex: z
          .number()
          .int()
          .nullable()
          .describe(
            "0-based index (the number before the `|`) of the single lyric line this reference appears on, in [0, N-1]. null if it spans multiple lines or the whole song. When set, anchors a per-line context note for the reader.",
          ),
        surface: z.string().describe("Exact phrase as it appears in the lyrics, verbatim."),
        type: z
          .enum(["place", "person", "event", "work", "concept", "phrase"])
          .describe("Kind of reference."),
      }),
    )
    .max(10)
    .describe(
      "Cultural, literary, historical, musical, or biographical references that listeners outside the source culture might miss. Exclude generic words. Pick the most translation-impacting; max 10.",
    ),

  secondaryLanguages: z
    .array(
      z.object({
        language: z
          .string()
          .describe(
            "BCP 47 tag of a non-primary language present in part of the lyrics (e.g., 'fr-FR', 'es-MX').",
          ),
        lineIndices: z
          .array(z.number().int())
          .describe(
            "0-based indices (the number printed before the `|`) of the lyric lines written in this language.",
          ),
      }),
    )
    .max(6)
    .describe(
      "Passages NOT in the primary language — a foreign verse, a sampled hook, a code-switched line. Each entry must be a different base language from `detectedLanguage`, and each language appears at most once. Empty array when the whole song is in one language.",
    ),

  songContext: z
    .string()
    .describe(
      "1–3 sentences on the song's release context, album, known inspiration, or reception. Never invent; when search is only partial, hedge explicitly ('reportedly', 'widely attributed to') rather than asserting. Empty string is the safe default when nothing was confirmed.",
    ),

  summary: z
    .string()
    .describe(
      "2–4 sentence prose distillation of what a translator most needs to know. Lead with essential meaning; end with the most critical translation guidance.",
    ),

  themes: z
    .array(z.string())
    .max(6)
    .describe(
      "0–6 short noun phrases naming the song's central subjects (e.g., 'unrequited love', 'class struggle', 'coming of age'). Each ≤ 4 words. Language-agnostic — these are shared across all translations. Empty array for instrumental or vocalise tracks with no lyrical subject.",
    ),

  translationHazards: z
    .array(z.string())
    .max(8)
    .describe(
      "1–8 explicit warnings for downstream translators (e.g., 'saudade is untranslatable — preserve as loanword with translator note'; 'gendered pronouns ambiguous in source, must be inferred per target language'). Each entry is one short sentence.",
    ),

  wordplay: z
    .array(
      z.object({
        explanation: z
          .string()
          .describe(
            "How it works (homophone, double meaning, rhyme trick, anagram, etc.) and what the dual meaning is.",
          ),
        lineIndex: z
          .number()
          .int()
          .nullable()
          .describe(
            "Copy the 0-based index printed before the `|` on the lyric line where the wordplay occurs, in [0, N-1]. null if it spans multiple lines.",
          ),
        surface: z.string().describe("Phrase containing the wordplay, verbatim."),
      }),
    )
    .max(10)
    .describe(
      "Puns, double meanings, rhyme-driven word choices, or other devices that depend on the source language's sounds or structure and rarely survive translation intact.",
    ),
});

export type ResearchNotes = z.infer<typeof researchNotesSchema>;
