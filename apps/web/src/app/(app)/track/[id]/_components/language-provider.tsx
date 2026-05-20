"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { getTrackLyrics, type LyricsStatus } from "@/lib/api";

type LyricsLanguage = {
  code: string;
  label: string;
};

const LANGUAGES: ReadonlyArray<LyricsLanguage> = [
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

const DEFAULT_TARGET: LyricsLanguage = { code: "es-ES", label: "Spanish" };
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 20;

const buildLanguageFromCode = (code: string): LyricsLanguage => {
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

type LanguageContextValue = {
  setTarget: (language: LyricsLanguage) => void;
  source: LyricsLanguage | null;
  target: LyricsLanguage;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const useLanguage = (): LanguageContextValue => {
  const value = useContext(LanguageContext);

  if (!value) {
    throw new Error("useLanguage must be used inside a LanguageProvider");
  }

  return value;
};

type LanguageProviderProps = {
  children: ReactNode;
  initialLanguage: string | null;
  lyricsStatus: LyricsStatus | null;
  trackId: string;
};

const LanguageProvider = ({
  children,
  initialLanguage,
  lyricsStatus,
  trackId,
}: LanguageProviderProps) => {
  const [sourceCode, setSourceCode] = useState<string | null>(initialLanguage);
  const [target, setTarget] = useState<LyricsLanguage>(DEFAULT_TARGET);

  useEffect(() => {
    if (sourceCode || lyricsStatus !== "AVAILABLE") {
      return;
    }

    const controller = new AbortController();
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const poll = async () => {
      if (stopped) {
        return;
      }

      attempts++;

      try {
        const lyrics = await getTrackLyrics(trackId, { signal: controller.signal });

        if (stopped) {
          return;
        }

        if (lyrics?.language) {
          setSourceCode(lyrics.language);
          return;
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        return;
      }

      timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timeoutId = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      controller.abort();
    };
  }, [sourceCode, lyricsStatus, trackId]);

  const source = sourceCode ? buildLanguageFromCode(sourceCode) : null;

  return (
    <LanguageContext.Provider value={{ setTarget, source, target }}>
      {children}
    </LanguageContext.Provider>
  );
};

export type { LyricsLanguage };
export { buildLanguageFromCode, LANGUAGES, LanguageProvider, useLanguage };
