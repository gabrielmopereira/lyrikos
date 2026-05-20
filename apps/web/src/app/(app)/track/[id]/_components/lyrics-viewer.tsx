"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import type { LyricLine } from "@/types/lyrics";

import { useLanguage } from "./language-provider";

type LyricsViewerProps = {
  lines: Array<LyricLine>;
};

const lineCount = (lines: Array<LyricLine>) => lines.length;
const noteCount = (lines: Array<LyricLine>) => lines.filter((line) => line.note).length;

const isTranslated = (lines: Array<LyricLine>) =>
  lines.some((line) => line.translation.trim() !== "");

const isSynced = (lines: Array<LyricLine>) => lines.some((line) => line.time);

const LyricsViewer = ({ lines }: LyricsViewerProps) => {
  const { source, target } = useLanguage();

  const showOnlyOriginal = !source || source.code === target.code || !isTranslated(lines);
  const showTimes = isSynced(lines);

  return (
    <Tabs className="min-h-0 flex-col" defaultValue={showOnlyOriginal ? "original" : "stacked"}>
      <CardHeader className="h-max grid-cols-2" data-divider>
        <div className="flex items-baseline gap-3 self-center">
          <CardTitle>Lyrics</CardTitle>
          <CardDescription>
            {lineCount(lines)} lines · {noteCount(lines)} notes
          </CardDescription>
        </div>

        <TabsList className="justify-self-end">
          <TabsTrigger disabled={showOnlyOriginal} value="stacked">
            Stacked
          </TabsTrigger>

          <TabsTrigger disabled={showOnlyOriginal} value="side-by-side">
            Side-by-side
          </TabsTrigger>

          <TabsTrigger value="original">Original only</TabsTrigger>
        </TabsList>
      </CardHeader>

      <CardContent data-flush data-scroll>
        <TabsContent className="min-h-0 px-8 pt-2 pb-8" value="stacked">
          <ol className="flex flex-col gap-5">
            {lines.map((line, index) => (
              <li
                className={showTimes ? "grid grid-cols-[64px_1fr] gap-x-4" : "flex flex-col"}
                key={index}
              >
                {showTimes ? (
                  <span className="pt-1 font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                    {line.time}
                  </span>
                ) : null}

                <div className="flex flex-col gap-1">
                  <p className="font-serif text-xl leading-snug text-foreground">{line.original}</p>
                  <p className="font-serif text-lg leading-snug text-primary italic">
                    {line.translation}
                  </p>
                  {line.note ? (
                    <Alert className="mt-3" variant="note">
                      <AlertTitle>Note</AlertTitle>
                      <AlertDescription>{line.note}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent className="px-8 pt-2 pb-8" value="side-by-side">
          <div
            className={
              showTimes
                ? "grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-8 border-b border-marble-faint pb-3"
                : "grid grid-cols-2 items-baseline gap-x-8 border-b border-marble-faint pb-3"
            }
          >
            <span className="font-mono text-xs tracking-widest text-marble-dim uppercase">
              {source?.label ?? ""}
            </span>

            {showTimes ? <span className="font-mono text-xs text-marble-faint">→</span> : null}

            <span className="ml-2 font-mono text-xs tracking-widest text-primary uppercase">
              {target.label}
            </span>
          </div>

          <ol
            className={
              showTimes
                ? "mt-4 grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-8 gap-y-4"
                : "mt-4 grid grid-cols-2 items-baseline gap-x-8 gap-y-4"
            }
          >
            {lines.map((line, index) => (
              <li className="contents" key={index}>
                <p className="font-serif text-xl leading-snug text-foreground">{line.original}</p>
                {showTimes ? (
                  <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                    {line.time}
                  </span>
                ) : null}
                <p className="font-serif text-xl leading-snug text-primary italic">
                  {line.translation}
                </p>
                {line.note ? (
                  <Alert className={showTimes ? "col-span-3" : "col-span-2"} variant="note">
                    <AlertTitle>Note</AlertTitle>
                    <AlertDescription>{line.note}</AlertDescription>
                  </Alert>
                ) : null}
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent className="px-8 pt-2 pb-8" value="original">
          <ol className="flex flex-col gap-7">
            {lines.map((line, index) => (
              <li
                className={
                  showTimes ? "grid grid-cols-[64px_1fr] items-baseline gap-x-4" : "flex flex-col"
                }
                key={index}
              >
                {showTimes ? (
                  <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                    {line.time}
                  </span>
                ) : null}
                <p className="font-serif text-xl leading-snug text-foreground">{line.original}</p>
              </li>
            ))}
          </ol>
        </TabsContent>
      </CardContent>
    </Tabs>
  );
};

export default LyricsViewer;
