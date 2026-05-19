import { z } from "zod";

export const MODEL_ID = "gemini-3-flash-preview" as const;
export const PROMPT_VERSION = "research-v1" as const;

export const SYSTEM_PROMPT = `You are a music research analyst feeding a multi-language translation pipeline. You produce factual, grounded notes — never translations.

Rules:
- Use google_search to verify the artist, song background, and any cultural references before asserting them.
- Never invent. If a claim cannot be verified, lower its confidence or omit it.
- Focus on what shifts across languages: idioms, slang, register, wordplay, cultural refs, perspective shifts. Surface translation hazards explicitly.
- Do not translate any lyrics or phrases. Quote source text verbatim in 'surface' fields.
- Be concise. Each free-text field has a length expectation in its description — respect it.`;

export const buildUserPrompt = (input: {
  albumName: string;
  artistName: string;
  plainLyrics: string;
  title: string;
}) => `Track: "${input.title}" by ${input.artistName}
Album: ${input.albumName}

Lyrics:
---
${input.plainLyrics}
---

Research this track and return the structured notes object.`;

export const researchNotesSchema = z.object({
  artistContext: z
    .string()
    .describe(
      "1–3 sentences on the artist's background, era, scene, or persona insofar as it shapes interpretation. Only verified facts. Empty string if nothing relevant is known.",
    ),

  detectedLanguage: z
    .string()
    .describe(
      "ISO 639-1 code (e.g., 'en', 'pt', 'es', 'ja') of the dominant language in the lyrics. For mixed-language lyrics, pick the primary language and surface the secondary in `translationHazards`.",
    ),

  idioms: z
    .array(
      z.object({
        figurative: z
          .string()
          .describe("Actual intended meaning a fluent speaker would understand."),
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
    .min(1)
    .max(4)
    .describe(
      "1–4 affective descriptors capturing the song's emotional register (e.g., 'wistful', 'defiant', 'euphoric'). Single words preferred. Guides tone preservation in translation.",
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

  songContext: z
    .string()
    .describe(
      "1–3 sentences on the song's release context, album, known inspiration, or reception. Only verified facts. Empty string if unknown.",
    ),

  summary: z
    .string()
    .describe(
      "2–4 sentence prose distillation of what a translator most needs to know. Lead with essential meaning; end with the most critical translation guidance. This field is stored separately from the rest of the JSON.",
    ),

  themes: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe(
      "1–6 short noun phrases naming the song's central subjects (e.g., 'unrequited love', 'class struggle', 'coming of age'). Each ≤ 4 words. Language-agnostic — these are shared across all translations.",
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
            "0-based index of the line within the lyrics text (split on newline). null if it spans multiple lines.",
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
