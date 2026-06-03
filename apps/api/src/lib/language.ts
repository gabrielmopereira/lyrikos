type SecondaryLanguage = { language: string; lineIndices: Array<number> };

const isRegionSpecificLanguageTag = (tag: string): boolean => {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region !== undefined;
  } catch {
    return false;
  }
};

const canonicalizeLanguageTag = (tag: string): string => new Intl.Locale(tag).baseName;

// Guarantees a region subtag on an otherwise-valid BCP 47 tag by expanding via
// CLDR likely-subtags (e.g. 'en' -> 'en-US', 'pt' -> 'pt-BR')
const ensureRegionSubtag = (tag: string): string => {
  const locale = new Intl.Locale(tag);

  if (locale.region) {
    return locale.baseName;
  }

  const region = locale.maximize().region;

  return region ? new Intl.Locale(`${locale.language}-${region}`).baseName : locale.baseName;
};

// Base languages whose regional variants are mutually intelligible enough that
// translating between them adds no value for lyrics.
const MUTUALLY_INTELLIGIBLE_BASE_LANGUAGES = new Set(["en", "de", "nl"]);

const areLanguageTagsMutuallyIntelligible = (source: string, target: string): boolean => {
  try {
    const sourceLanguage = new Intl.Locale(source).language;
    const targetLanguage = new Intl.Locale(target).language;

    return (
      sourceLanguage === targetLanguage && MUTUALLY_INTELLIGIBLE_BASE_LANGUAGES.has(sourceLanguage)
    );
  } catch {
    return false;
  }
};

// Bare base language ('es', 'en') extracted from a BCP 47 tag. A parseable tag
// with no language subtag (e.g. 'und', 'und-US') is the BCP 47 "undetermined"
// root — Intl.Locale reports its `.language` as undefined, so map it to 'und'.
const getBaseLanguage = (tag: string): string => {
  try {
    return new Intl.Locale(tag).language ?? "und";
  } catch {
    return tag.toLowerCase().split("-")[0] ?? "";
  }
};

// A tag carries no translatable content when its base language is 'und' (BCP 47
// "undetermined" — instrumental/vocalise tracks) or empty (never resolved).
const isUntranslatableBaseLanguage = (tag: string): boolean => {
  const base = getBaseLanguage(tag);
  return base === "und" || base.length === 0;
};

// How a translation request should be handled given the source language profile
// and the requested target:
// - skip: every language present is intelligible with the target — nothing to do.
// - full: the primary language needs translating — translate the whole song.
// - partial: the primary is intelligible with the target but foreign excerpts are
//   not — translate only those lines and pass the rest through.
type TranslationScope =
  | { kind: "skip" }
  | { kind: "full" }
  | { kind: "partial"; lineIndices: Array<number> };

const resolveTranslationScope = (
  primary: string,
  secondary: Array<SecondaryLanguage>,
  target: string,
): TranslationScope => {
  if (isUntranslatableBaseLanguage(primary)) {
    return { kind: "skip" };
  }

  if (!areLanguageTagsMutuallyIntelligible(primary, target)) {
    return { kind: "full" };
  }

  const foreignExcerpts = secondary.filter(
    (entry) => !areLanguageTagsMutuallyIntelligible(entry.language, target),
  );

  const foreignLines = foreignExcerpts.flatMap((entry) => entry.lineIndices);
  const lineIndices = [...new Set(foreignLines)].toSorted((a, b) => a - b);

  if (lineIndices.length === 0) {
    return { kind: "skip" };
  }

  return { kind: "partial", lineIndices };
};

export type { SecondaryLanguage, TranslationScope };
export {
  isRegionSpecificLanguageTag,
  canonicalizeLanguageTag,
  areLanguageTagsMutuallyIntelligible,
  getBaseLanguage,
  isUntranslatableBaseLanguage,
  resolveTranslationScope,
  ensureRegionSubtag,
};
