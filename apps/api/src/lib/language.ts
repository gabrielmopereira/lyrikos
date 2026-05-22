export const isRegionSpecificLanguageTag = (tag: string): boolean => {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region !== undefined;
  } catch {
    return false;
  }
};

export const canonicalizeLanguageTag = (tag: string): string => new Intl.Locale(tag).baseName;

// Base languages whose regional variants are mutually intelligible enough that
// translating between them adds no value for lyrics.
const MUTUALLY_INTELLIGIBLE_BASE_LANGUAGES = new Set(["en", "de", "nl"]);

export const areLanguageTagsMutuallyIntelligible = (source: string, target: string): boolean => {
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
