import type { Language } from "@/types/language";

const TARGET_LANGUAGE_COOKIE = "lyrikos.target-lang";

const LANGUAGES: ReadonlyArray<Language> = [
  { code: "en-US", label: "English (US)" },
  { code: "es-ES", label: "Spanish" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "ru-RU", label: "Russian" },
  { code: "pl-PL", label: "Polish" },
  { code: "nl-NL", label: "Dutch" },
  { code: "tr-TR", label: "Turkish" },
];

const DEFAULT_TARGET: Language = { code: "en-US", label: "English (US)" };

// Mirrors apps/api/src/lib/language.ts — keep in sync. Same base language AND
// that base is in the set means a translation adds no value for lyrics.
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

const buildLanguageFromCode = (code: string): Language => {
  const known = LANGUAGES.find((language) => language.code === code);

  if (known) {
    return known;
  }

  try {
    const locale = new Intl.Locale(code);
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

    const base = displayNames.of(locale.language) ?? locale.language;
    const region = locale.region ? ` (${locale.region})` : "";

    return { code: locale.baseName, label: `${base}${region}` };
  } catch {
    return { code, label: code };
  }
};

export {
  areLanguageTagsMutuallyIntelligible,
  buildLanguageFromCode,
  DEFAULT_TARGET,
  LANGUAGES,
  TARGET_LANGUAGE_COOKIE,
};
