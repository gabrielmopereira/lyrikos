"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import type { Lyrics, Translation } from "@/lib/api";
import { parseLyrics } from "@/lib/lyrics";
import type { LyricRow } from "@/lib/lyrics";

import { useLanguage } from "./language-provider";

const EmptyRow = ({
  className,
  index,
  length,
}: {
  className?: string;
  index: number;
  length: number;
}) => {
  if (index + 1 === length) {
    return null;
  }

  return <li aria-hidden className={cn("h-5", className)} />;
};

const TranslationNote = ({ className, note }: { className?: string; note?: string | null }) => {
  if (!note) {
    return null;
  }

  return (
    <Alert className={className} variant="note">
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>{note}</AlertDescription>
    </Alert>
  );
};

type ViewProps = {
  rows: Array<LyricRow>;
  showTimes: boolean;
};

type TranslatedViewProps = ViewProps & {
  segmentByIndex: Map<number, Translation["segments"][number]>;
};

const StackedView = ({ rows, segmentByIndex, showTimes }: TranslatedViewProps) => (
  <ol className="flex flex-col gap-5">
    {rows.map((row) => {
      if (row.original === "") {
        return <EmptyRow index={row.index} key={row.index} length={rows.length} />;
      }

      const segment = segmentByIndex.get(row.index);

      return (
        <li
          className={showTimes ? "grid grid-cols-[64px_1fr] gap-x-4" : "flex flex-col"}
          key={row.index}
        >
          {showTimes ? (
            <span className="pt-1 font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
              {row.time}
            </span>
          ) : null}

          <div className="flex flex-col gap-1">
            <p className="font-serif text-xl leading-snug text-foreground">{row.original}</p>

            {segment?.translated ? (
              <p className="font-serif text-lg leading-snug text-primary italic">
                {segment.translated}
              </p>
            ) : null}

            <TranslationNote className="mt-3" note={segment?.note} />
          </div>
        </li>
      );
    })}
  </ol>
);

const SideView = ({ rows, segmentByIndex, showTimes }: TranslatedViewProps) => (
  <ol
    className={cn(
      "mt-3 grid items-baseline gap-x-8 gap-y-3",
      showTimes ? "grid-cols-[1fr_auto_1fr]" : "grid-cols-2",
    )}
  >
    {rows.map((row) => {
      if (row.original === "") {
        return (
          <EmptyRow
            className={showTimes ? "col-span-3" : "col-span-2"}
            index={row.index}
            key={row.index}
            length={rows.length}
          />
        );
      }

      const segment = segmentByIndex.get(row.index);

      return (
        <li className="contents" key={row.index}>
          <p className="font-serif text-xl leading-snug text-foreground">{row.original}</p>

          {showTimes ? (
            <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
              {row.time}
            </span>
          ) : null}

          <p className="font-serif text-xl leading-snug text-primary italic">
            {segment?.translated ?? ""}
          </p>

          <TranslationNote
            className={showTimes ? "col-span-3" : "col-span-2"}
            note={segment?.note}
          />
        </li>
      );
    })}
  </ol>
);

const OriginalView = ({ rows, showTimes }: ViewProps) => (
  <ol className="flex flex-col gap-3">
    {rows.map((row) => {
      if (row.original === "") {
        return <EmptyRow index={row.index} key={row.index} length={rows.length} />;
      }

      return (
        <li
          className={
            showTimes ? "grid grid-cols-[64px_1fr] items-baseline gap-x-4" : "flex flex-col"
          }
          key={row.index}
        >
          {showTimes ? (
            <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
              {row.time}
            </span>
          ) : null}
          <p className="font-serif text-xl leading-snug text-foreground">{row.original}</p>
        </li>
      );
    })}
  </ol>
);

type LyricsViewerProps = {
  lyrics: Lyrics;
  translation: Translation | null;
};

const LyricsViewer = ({ lyrics, translation }: LyricsViewerProps) => {
  const { source, target } = useLanguage();

  const rows = parseLyrics(lyrics);
  const segmentByIndex = new Map(translation?.segments.map((segment) => [segment.index, segment]));

  const sameLanguage = source !== null && source.code === target.code;
  const showOnlyOriginal = translation === null || sameLanguage;
  const showTimes = rows.some((row) => row.time !== undefined);

  const lineCount = rows.filter((row) => row.original !== "").length;
  const noteCount = translation?.segments.filter((segment) => segment.note).length ?? 0;

  return (
    <Tabs className="min-h-0 flex-col" defaultValue={showOnlyOriginal ? "original" : "stacked"}>
      <CardHeader className="h-max grid-cols-2" data-divider>
        <div className="flex items-baseline gap-3 self-center">
          <CardTitle>Lyrics</CardTitle>
          <CardDescription>
            {lineCount} lines · {noteCount} notes
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
          <StackedView rows={rows} segmentByIndex={segmentByIndex} showTimes={showTimes} />
        </TabsContent>

        <TabsContent className="px-8 pt-2 pb-8" value="side-by-side">
          <div
            className={cn(
              "grid items-baseline gap-x-8 border-b border-marble-faint pb-3",
              showTimes ? "grid-cols-[1fr_auto_1fr]" : "grid-cols-2",
            )}
          >
            <span className="font-mono text-xs tracking-widest text-marble-dim uppercase">
              {source?.label ?? ""}
            </span>

            {showTimes ? <span className="font-mono text-xs text-marble-faint">→</span> : null}

            <span className="ml-2 font-mono text-xs tracking-widest text-primary uppercase">
              {target.label}
            </span>
          </div>

          <SideView rows={rows} segmentByIndex={segmentByIndex} showTimes={showTimes} />
        </TabsContent>

        <TabsContent className="px-8 pt-2 pb-8" value="original">
          <OriginalView rows={rows} showTimes={showTimes} />
        </TabsContent>
      </CardContent>
    </Tabs>
  );
};

export default LyricsViewer;
