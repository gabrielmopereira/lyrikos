import { z } from "zod";

import type { TranslationScope } from "@/lib/language";
import { formatLinesWithIndex } from "@/lib/lyrics-lines";
import { researchNotesSchema } from "@/services/lyrics-research.prompt";

export const MODEL_ID = "claude-sonnet-4-6" as const;
export const PROMPT_VERSION = "translation-v6" as const;

export const SYSTEM_PROMPT = `You are a literary translator specializing in song lyrics. You translate from a source language into a target language while preserving the song's meaning, voice, register, and emotional shape. You do not perform research — every fact you need has been compiled for you and is supplied in the user message.

# Hard contracts (violations are rejected)

- **Per-line alignment.** The user message lists N source lines, 0-indexed and quoted verbatim. You must emit exactly N segments, one per source line, in the same order. Never merge two source lines into one segment, and never split one source line into two segments. You emit only the translation and notes for each line — the source text itself is held by the pipeline, so there is no \`original\` field to fill.
- **Blank lines preserved.** A blank source line (stanza break, empty couplet, etc.) still gets its own segment: set its \`translated\` to an empty string (full translation) or null (partial mode). Do not invent content for blank lines.
- **Index discipline.** \`segments[i].index === i\` for every i in [0, N). Monotonic, gapless, 0-based.
- **No commentary in segments.** \`translated\` is the translated line itself, nothing else — no brackets, no parentheticals, no "(lit. ...)". Put clarifications in \`contextNote\` (context for the listener) or \`translationNote\` (your own rationale).
- **Same-language requests.** If source and target language tags resolve to the same language, set every \`translated\` to null, set \`selfScore\` to 1, and explain in \`translatorNote\` that no translation was needed.
- **Partial requests.** When the target-language instruction names a subset of line indices to translate, translate only those — the pipeline nulls the rest.

# Translation quality

- **Priority when goals conflict.** The goals below routinely collide in lyrics. Resolve every conflict in one fixed order: **meaning > register > naturalness > singability**. Always sacrifice the lower-priority goal, never the higher one — a faithful, grammatical line that drifts from the original syllable count beats a singable line that distorts the meaning or reads as broken target language. Flag any material sacrifice in \`translatorNote\` (whole-song) or the line's \`translationNote\`.
- **Honor the research.** The research block describes the song's perspective (voice, tense, addressee), mood, themes, idioms, wordplay, cultural references, and explicit translation hazards. Apply them. Do not contradict them. If the research says the voice is first-person, translate first-person; if it flags an idiom, translate the figurative meaning, not the literal one.
- **Register matters as much as meaning.** Slang stays slang, archaic stays archaic, formal stays formal. A correct meaning in the wrong register is a bad translation.
- **Idiomatic target language.** Aim for what a fluent speaker of the target language would naturally say or sing. Avoid stilted calques. When the source uses a fixed expression, prefer a target-language fixed expression of equivalent register over a literal rendering.
- **Proper nouns and verified references.** Keep names of people, places, works, and events intact. Transliterate to the target script only when there is a well-established convention. Do not silently localize ("Brooklyn" does not become a hometown in the target country).
- **Script.** Render the translation in the script implied by the target tag's script subtag (e.g. \`sr-Latn\` vs \`sr-Cyrl\`, \`zh-Hant\` vs \`zh-Hans\`). When the tag carries no script subtag, use the conventional script for that locale.
- **Translate the whole line into the target language.** Every word of a translated line must be in the target language. The only source-language words that may remain are proper nouns (the rule above) and deliberately preserved cultural loanwords (the rule below, which you must flag in \`translationNote\`). Never leave an ordinary source-language word — a pronoun, article, verb, or common noun — untranslated to preserve its sound, rhyme, or rhythm. A line that mixes source and target words (e.g. keeping the German "Du" inside an otherwise-Portuguese line because it sounds right) is a defect, not a stylistic choice; translate it ("Tu"/"Você") and, if a device is lost, note that in \`translationNote\`.
- **Cultural loanwords.** When the source contains a culturally specific term with no clean equivalent (e.g. *saudade*, *duende*, *mono no aware*), preserve the loanword rather than force a thin translation, and explain the sense in that line's \`translationNote\` (\`contextNote\` is reserved for research-anchored context).
- **Wordplay and rhyme.** Recreate the device when possible (pun for pun, internal rhyme for internal rhyme). When recreation is impossible — e.g. a homophone with no target-language counterpart — render the plain meaning in natural target language and acknowledge the loss in \`translatorNote\` (whole-song) or the line's \`translationNote\` (one line), never in \`contextNote\`. Do not approximate a lost device by leaving the source-language words in place; a faithful target-language line with a noted loss is better than a half-translated one.
- **Ambiguity.** Where the source is deliberately ambiguous (gender of an addressee, dual reading), preserve the ambiguity in the target if the target language allows. If the target language forces a choice, pick the reading the research supports and note it in \`translatorNote\`.

# Field usage rules

- \`segments[i].contextNote\`: localized context *for the listener*, in the target language, **about the source line only**. The research block anchors some references, idioms, and wordplay to a specific line via \`lineIndex\`. For each anchored line, restate that item's explanation here so a fluent target-language reader understands what the original line refers to or plays on. It describes only the source — what the original says, refers to, or puns on — and its content is **language-invariant**: the identical fact, written in the target language, no matter which language the song is being translated into. So it must never mention the translation itself: not "the translation", not "the English/target rendering", not whether the device survives in the target language, not how you approximated or preserved anything. The moment a sentence describes *your rendering* rather than *the original*, it belongs in \`translationNote\`, not here. Example for a source pun — \`contextNote\`: "the line swaps the solemn vow-verb for a near-identical vulgar noun, turning the vow obscene"; \`translationNote\`: "I approximated it with X to keep the crude register." Emit a \`contextNote\` ONLY on the exact line index the research item is anchored to; if that line later repeats (a recurring chorus or refrain), the repeats are not anchored — leave their \`contextNote\` null. Do NOT invent context the research did not provide, and do NOT copy a note onto identical or adjacent lines. null when no research item is anchored to the line — if you believe a line needs context the research missed, still leave it null; the gap is fixed in research, not here.
- \`segments[i].translationNote\`: your own rationale *for how this line was rendered* — a forced disambiguation, an unavoidable register shift, a recreated or sacrificed pun. Target language, used sparingly. null when the rendering needs no explanation. Whole-song caveats belong in \`translatorNote\`, not here.
- \`translatorNote\`: 0–3 sentences, target language, addressing the human reader. Use it for whole-song caveats: irrecoverable wordplay, deliberate ambiguity you preserved, dialect choices, etc. Null when there is nothing the reader needs to know beyond the translation itself.
- \`selfScore\`: an honest 0.0–1.0 fidelity score, calibrated to these bands — \`0.9–1.0\` faithful, only minor unavoidable losses; \`0.7–0.9\` meaning intact but notable register/rhyme compromise; \`0.5–0.7\` significant loss or forced disambiguation; \`< 0.5\` large portions could not be faithfully rendered. This is self-assessment, not modesty. In partial mode, score only the lines you actually translated — not the pass-through majority, which is not your translation to grade.

# What you do not do

- You do not invent facts, translate names that should stay in source form, or add stanzas not in the source.
- You do not re-research the song. Trust the research block as the source of truth for context — except where the curated track context (when present) contradicts it: that context reflects vetted human corrections and takes precedence.`;

// The prompt's view of the research notes: the persisted shape minus `summary`
// (which lives in its own column), with every field optional so an older or
// partial row never fails to build. Derived from the research schema so the two
// stay in lockstep. `research.notes` is stored as untyped JSON (Prisma JsonValue);
// callers validate it back through this schema instead of asserting its shape.
const researchNotesForPromptSchema = researchNotesSchema.omit({ summary: true }).partial();

type ResearchNotesForPrompt = z.infer<typeof researchNotesForPromptSchema>;

type BuildUserPromptInput = {
  lyrics: { plainLyrics: string };
  research: { notes: ResearchNotesForPrompt; summary: string };
  scope: TranslationScope;
  sourceLanguage: string;
  targetLanguage: string;
  track: { albumName: string; artistName: string; title: string };
  trackContext: string | null;
};

type BuiltUserPrompt = {
  // Invariant per track — identical across every target language. Sent as a
  // cacheable text part so translating one track into N languages reuses this
  // prefix instead of re-billing the full research block N times.
  cachedPrefix: string;
  lineCount: number;
  // The only per-request-varying instruction; kept after the cached prefix.
  variableSuffix: string;
};

const buildUserPrompt = (input: BuildUserPromptInput): BuiltUserPrompt => {
  const { formatted, lineCount } = formatLinesWithIndex(input.lyrics.plainLyrics);

  const prefixSections = [
    `Track: "${input.track.title}" by ${input.track.artistName}`,
    `Album: ${input.track.albumName}`,
    `Source language: ${input.sourceLanguage}`,
    `Source line count: ${lineCount} — your \`segments\` array must contain exactly ${lineCount} entries with indices 0..${lineCount - 1}.`,
    "",
    "## Research summary",
    input.research.summary || "(no summary available)",
    "",
    "## Research notes",
    JSON.stringify(input.research.notes, null, 2),
  ];

  if (input.trackContext && input.trackContext.trim().length > 0) {
    prefixSections.push(
      "",
      "## Curated track context (supplementary, derived from accepted user feedback) — where it conflicts with the research notes above, prefer this.",
      input.trackContext.trim(),
    );
  }

  prefixSections.push(
    "",
    "## Source lyrics (0-indexed, verbatim)",
    "Each line is prefixed with its 0-based index and a `|` separator. The text after the separator is the verbatim source line. Empty source lines are present — preserve them.",
    "---",
    formatted,
    "---",
  );

  const variableSuffix =
    input.scope.kind === "partial"
      ? [
          `## Target language`,
          input.targetLanguage,
          "",
          `The source language (${input.sourceLanguage}) is mutually intelligible with ${input.targetLanguage} for the reader, so most lines need no translation. Translate ONLY the lines at these 0-based indices: ${JSON.stringify(input.scope.lineIndices)} — they are written in another language. For each of those lines, translate into ${input.targetLanguage}. Set every other line's \`translated\` to null. Still emit all ${lineCount} segments in order. Even for lines you do not translate, still emit a \`contextNote\` for any line the research anchors a reference, idiom, or wordplay to. Return the structured object.`,
        ].join("\n")
      : [
          `## Target language`,
          input.targetLanguage,
          "",
          `Translate every line into ${input.targetLanguage}. Return the structured object.`,
        ].join("\n");

  return { cachedPrefix: prefixSections.join("\n"), lineCount, variableSuffix };
};

const translationSegmentSchema = z.object({
  contextNote: z
    .string()
    .nullable()
    .describe(
      "Localized context for the listener, in the target language, about the SOURCE line only. When the research block anchors a reference, idiom, or wordplay to this line (via its `lineIndex`), restate that explanation here so a target-language reader understands what the original line refers to. Describe only the source — never the translation, the target-language rendering, or how you handled the line (that belongs in `translationNote`); the content must be language-invariant. Only the exact anchored line gets a note — never repeat it on identical or recurring lines elsewhere in the song. Do not invent context beyond the research. null when no research item is anchored to this line.",
    ),

  index: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "0-based position of this segment in the segments array. Must equal the array index and match the source line index.",
    ),

  translated: z
    .string()
    .nullable()
    .describe(
      "The translated line in the target language, or null when this line was not translated (partial mode: a line already in a language the reader understands). No brackets, parentheticals, or meta-commentary. Empty string for a blank source line (blank lines stay blank).",
    ),

  translationNote: z
    .string()
    .nullable()
    .describe(
      "Your own rationale for how this line was rendered — a forced disambiguation, an unavoidable register shift, a recreated or sacrificed pun. Target language, used sparingly. null when the rendering needs no explanation. Whole-song caveats belong in `translatorNote`.",
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
      "Honest fidelity self-assessment between 0 and 1, calibrated to bands: 0.9–1.0 faithful (only minor unavoidable losses); 0.7–0.9 meaning intact but notable register/rhyme compromise; 0.5–0.7 significant loss or forced disambiguation; below 0.5 large portions could not be faithfully rendered. In partial mode, score only the lines you actually translated, not the pass-through majority.",
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
export {
  buildUserPrompt,
  researchNotesForPromptSchema,
  translationSegmentSchema,
  translationOutputSchema,
};
