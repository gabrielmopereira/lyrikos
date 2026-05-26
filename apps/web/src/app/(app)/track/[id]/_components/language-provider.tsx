"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, startTransition, useContext, useState } from "react";

import { setTargetLang } from "@/actions/language";
import { buildLanguageFromCode } from "@/lib/language";
import type { Language } from "@/types/language";

type LanguageContextValue = {
  setTarget: (language: Language) => void;
  source: Language | null;
  target: Language;
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
  initialTarget: Language;
};

const LanguageProvider = ({ children, initialLanguage, initialTarget }: LanguageProviderProps) => {
  const router = useRouter();
  const [sourceCode] = useState<string | null>(initialLanguage);
  const [target, setTargetState] = useState<Language>(initialTarget);

  const setTarget = (language: Language) => {
    setTargetState(language);
    startTransition(async () => {
      await setTargetLang(language.code);
      router.refresh();
    });
  };

  const source = sourceCode ? buildLanguageFromCode(sourceCode) : null;

  return (
    <LanguageContext.Provider value={{ setTarget, source, target }}>
      {children}
    </LanguageContext.Provider>
  );
};

export { LanguageProvider, useLanguage };
