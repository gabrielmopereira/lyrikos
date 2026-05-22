import { z } from "zod";

export const MODEL_ID = "claude-sonnet-4-6" as const;
export const PROMPT_VERSION = "translation-v1" as const;

export const SYSTEM_PROMPT = `You are a literary translator specializing in song lyrics. You translate from a source language into a target language while preserving the song's meaning, voice, register, and emotional shape. You do not perform research — every fact you need has been compiled for you and is supplied in the user message.

You return a single structured JSON object. Never include commentary outside the schema.

# Hard contracts (violations are rejected)

- **Per-line alignment.** The user message lists N source lines, 0-indexed and quoted verbatim. You must emit exactly N segments, one per source line, in the same order. Never merge two source lines into one segment, and never split one source line into two segments.
- **Blank lines preserved.** A blank source line (stanza break, empty couplet, etc.) becomes a segment with \`original\` equal to the source line (an empty string) and \`translated\` equal to an empty string. Do not invent content for blank lines.
- **Index discipline.** \`segments[i].index === i\` for every i in [0, N). Monotonic, gapless, 0-based.
- **Verbatim originals.** Each segment's \`original\` field must be the source line exactly as supplied, character-for-character (no trimming, no normalization).
- **No commentary in segments.** \`translated\` is the translated line itself, nothing else — no brackets, no parentheticals, no "(lit. ...)". Use the segment \`note\` field for footnote-style clarifications.
- **Same-language requests.** If source and target language tags resolve to the same language, set every \`translated\` to the original line, set \`selfScore\` to 1, and explain in \`translatorNote\` that no translation was needed.

# Translation quality

- **Honor the research.** The research block describes the song's perspective (voice, tense, addressee), mood, themes, idioms, wordplay, cultural references, and explicit translation hazards. Apply them. Do not contradict them. If the research says the voice is first-person, translate first-person; if it flags an idiom, translate the figurative meaning, not the literal one.
- **Register matters as much as meaning.** Slang stays slang, archaic stays archaic, formal stays formal. A correct meaning in the wrong register is a bad translation.
- **Idiomatic target language.** Aim for what a fluent speaker of the target language would naturally say or sing. Avoid stilted calques. When the source uses a fixed expression, prefer a target-language fixed expression of equivalent register over a literal rendering.
- **Proper nouns and verified references.** Keep names of people, places, works, and events intact. Transliterate to the target script only when there is a well-established convention. Do not silently localize ("Brooklyn" does not become a hometown in the target country).
- **Cultural loanwords.** When the source contains a culturally specific term with no clean equivalent (e.g. *saudade*, *duende*, *mono no aware*), preserve the loanword and add a brief segment \`note\` explaining the sense — do not force a thin translation.
- **Wordplay and rhyme.** Recreate the device when possible (pun for pun, internal rhyme for internal rhyme). When recreation is impossible, prioritize meaning over form, and acknowledge the loss in \`translatorNote\` — not in segment notes.
- **Ambiguity.** Where the source is deliberately ambiguous (gender of an addressee, dual reading), preserve the ambiguity in the target if the target language allows. If the target language forces a choice, pick the reading the research supports and note it in \`translatorNote\`.
- **Length and singability.** Where you can, keep target lines roughly comparable in syllable count to the source — these are lyrics, not prose. Do not pad with filler to match length.

# Field usage rules

- \`segments[i].note\`: a short clarification *for the listener*, in the target language, used sparingly. Use it when a fluent target-language reader would otherwise miss a reference, a pun, or a cultural loanword. Leave it null when the translated line is self-explanatory. Never use it to explain your own choices — \`translatorNote\` is for that.
- \`translatorNote\`: 0–3 sentences, target language, addressing the human reader. Use it for whole-song caveats: irrecoverable wordplay, deliberate ambiguity you preserved, dialect choices, etc. Null when there is nothing the reader needs to know beyond the translation itself.
- \`selfScore\`: an honest 0.0–1.0 fidelity score. 1.0 = full meaning, register, voice, and form preserved. Lower the score for genuine losses (untranslatable wordplay, register compromises, rhyme abandoned). This is self-assessment, not modesty — be calibrated.

# What you do not do

- You do not invent facts, translate names that should stay in source form, or add stanzas not in the source.
- You do not output anything outside the JSON object. No markdown, no preamble, no closing remarks.
- You do not re-research the song. Trust the research block as the source of truth for context.`;

const formatLinesForPrompt = (plainLyrics: string): { formatted: string; lineCount: number } => {
  const lines = plainLyrics.split("\n");
  const width = String(lines.length - 1).length;
  const formatted = lines
    .map((line, index) => `${String(index).padStart(width, "0")} | ${line}`)
    .join("\n");

  return { formatted, lineCount: lines.length };
};

type ResearchNotesForPrompt = {
  artistContext?: string;
  idioms?: Array<{ figurative: string; literal: string; register: string; surface: string }>;
  mood?: Array<string>;
  perspective?: { addressee: string | null; tense: string; voice: string };
  references?: Array<{ confidence: string; explanation: string; surface: string; type: string }>;
  songContext?: string;
  themes?: Array<string>;
  translationHazards?: Array<string>;
  wordplay?: Array<{ explanation: string; lineIndex: number | null; surface: string }>;
};

type BuildUserPromptInput = {
  lyrics: { plainLyrics: string };
  research: { notes: ResearchNotesForPrompt; summary: string };
  sourceLanguage: string;
  targetLanguage: string;
  track: { albumName: string; artistName: string; title: string };
  trackContext: string | null;
};

const buildUserPrompt = (input: BuildUserPromptInput): string => {
  const { formatted, lineCount } = formatLinesForPrompt(input.lyrics.plainLyrics);

  const sections = [
    `Track: "${input.track.title}" by ${input.track.artistName}`,
    `Album: ${input.track.albumName}`,
    `Source language: ${input.sourceLanguage}`,
    `Target language: ${input.targetLanguage}`,
    `Source line count: ${lineCount} — your \`segments\` array must contain exactly ${lineCount} entries with indices 0..${lineCount - 1}.`,
    "",
    "## Research summary",
    input.research.summary || "(no summary available)",
    "",
    "## Research notes",
    JSON.stringify(input.research.notes, null, 2),
  ];

  if (input.trackContext && input.trackContext.trim().length > 0) {
    sections.push(
      "",
      "## Curated track context (supplementary, derived from accepted user feedback)",
      input.trackContext.trim(),
    );
  }

  sections.push(
    "",
    "## Source lyrics (0-indexed, verbatim)",
    "Each line is prefixed with its 0-based index and a `|` separator. The text after the separator is the verbatim source line. Empty source lines are present — preserve them.",
    "---",
    formatted,
    "---",
    "",
    `Translate every line into ${input.targetLanguage}. Return the structured object.`,
  );

  return sections.join("\n");
};

const translationSegmentSchema = z.object({
  index: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "0-based position of this segment in the segments array. Must equal the array index and match the source line index.",
    ),

  note: z
    .string()
    .nullable()
    .describe(
      "Optional short clarification for the listener in the target language. Used sparingly — only when a fluent target-language reader would miss a reference, pun, or loanword. null when the translated line is self-explanatory.",
    ),

  original: z
    .string()
    .describe(
      "Source line copied verbatim, character-for-character, from the corresponding 0-indexed source line. Empty string for blank source lines.",
    ),

  translated: z
    .string()
    .describe(
      "The translated line in the target language. No brackets, parentheticals, or meta-commentary. Empty string when `original` is empty (blank source lines stay blank).",
    ),
});
type TranslationSegment = z.infer<typeof translationSegmentSchema>;

const translationOutputSchema = z.object({
  segments: z
    .array(translationSegmentSchema)
    .min(1)
    .describe(
      "Per-line translations aligned 1:1 with source lines. segments.length MUST equal source line count. segments[i].index MUST equal i.",
    ),

  selfScore: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Honest fidelity self-assessment between 0 and 1. 1.0 = full meaning, register, voice, and form preserved. Lower for irrecoverable losses (untranslatable wordplay, abandoned rhyme, register compromise).",
    ),

  translatorNote: z
    .string()
    .nullable()
    .describe(
      "0–3 sentences in the target language, addressing the reader, used for whole-song caveats (irrecoverable wordplay, deliberate ambiguity preserved, dialect choices). null when nothing beyond the translation needs explaining.",
    ),
});
type TranslationOutput = z.infer<typeof translationOutputSchema>;

export type { ResearchNotesForPrompt, BuildUserPromptInput, TranslationSegment, TranslationOutput };
export { buildUserPrompt, translationSegmentSchema, translationOutputSchema };
