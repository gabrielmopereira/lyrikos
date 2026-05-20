"use client";

import { Card } from "@repo/ui/components/card";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";

import { LANGUAGES, useLanguage } from "./language-provider";

const LanguageSelector = () => {
  const { setTarget, source, target } = useLanguage();

  return (
    <Card className="self-end px-5 py-4" size="xs" tone="glass">
      <div className="flex items-center gap-8">
        <span className="font-mono text-[10px] tracking-[0.22em] text-marble-dim uppercase">
          Translation
        </span>

        <Popover>
          <PopoverTrigger className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1 font-mono text-xs tracking-widest transition-colors hover:bg-glass-strong focus-visible:outline-hidden">
            {source ? (
              <span>{source.code}</span>
            ) : (
              <Skeleton
                aria-label="Detecting source language"
                className="h-3.5 w-12"
                variant="rounded"
              />
            )}
            <span className="text-primary">→</span>
            <span>{target.code}</span>
            <ChevronDown className="size-3 text-marble-dim" />
          </PopoverTrigger>

          <PopoverContent align="end" className="w-56 p-2">
            <p className="px-2 pt-1 pb-2 font-mono text-[10px] tracking-[0.22em] text-marble-dim uppercase">
              Translate to
            </p>
            <ul className="flex flex-col">
              {LANGUAGES.map((language) => {
                const isSelected = language.code === target.code;
                return (
                  <li key={language.code}>
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        "hover:bg-glass focus-visible:bg-glass focus-visible:outline-hidden",
                        isSelected && "text-primary",
                      )}
                      onClick={() => setTarget(language)}
                      type="button"
                    >
                      <span className="w-14 font-mono text-[10px] tracking-widest">
                        {language.code}
                      </span>
                      <span className="flex-1">{language.label}</span>
                      {isSelected ? <Check className="size-3.5" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
};

export default LanguageSelector;
