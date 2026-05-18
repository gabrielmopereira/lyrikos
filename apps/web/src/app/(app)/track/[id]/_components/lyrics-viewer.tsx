import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

export type LyricLine = {
  note?: string;
  original: string;
  time: string;
  translation: string;
};

type Props = {
  lines: Array<LyricLine>;
  sourceLabel: string;
  targetLabel: string;
};

const lineCount = (lines: Array<LyricLine>) => lines.length;
const noteCount = (lines: Array<LyricLine>) => lines.filter((line) => line.note).length;

const LyricsViewer = ({ lines, sourceLabel, targetLabel }: Props) => (
  <Tabs className="min-h-0 flex-col" defaultValue="stacked">
    <CardHeader className="h-max grid-cols-2" data-divider>
      <div className="flex items-baseline gap-3 self-center">
        <CardTitle>Lyrics</CardTitle>
        <CardDescription>
          {lineCount(lines)} lines · {noteCount(lines)} notes
        </CardDescription>
      </div>

      <TabsList className="justify-self-end">
        <TabsTrigger value="stacked">Stacked</TabsTrigger>
        <TabsTrigger value="side-by-side">Side-by-side</TabsTrigger>
        <TabsTrigger value="original">Original only</TabsTrigger>
      </TabsList>
    </CardHeader>

    <CardContent data-flush data-scroll>
      <TabsContent className="min-h-0 px-8 pt-2 pb-8" value="stacked">
        <ol className="flex flex-col gap-5">
          {lines.map((line, index) => (
            <li className="grid grid-cols-[64px_1fr] gap-x-4" key={index}>
              <span className="pt-1 font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                {line.time}
              </span>
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-8 border-b border-marble-faint pb-3">
          <span className="font-mono text-xs tracking-widest text-marble-dim uppercase">
            {sourceLabel}
          </span>
          <span className="font-mono text-xs text-marble-faint">→</span>
          <span className="ml-2 font-mono text-xs tracking-widest text-primary uppercase">
            {targetLabel}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-8 gap-y-4">
          {lines.map((line, index) => (
            <li className="contents" key={index}>
              <p className="font-serif text-xl leading-snug text-foreground">{line.original}</p>
              <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                {line.time}
              </span>
              <p className="font-serif text-xl leading-snug text-primary italic">
                {line.translation}
              </p>
              {line.note ? (
                <Alert className="col-span-3" variant="note">
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
            <li className="grid grid-cols-[64px_1fr] items-baseline gap-x-4" key={index}>
              <span className="font-mono text-xs tracking-widest text-marble-faint uppercase tabular-nums">
                {line.time}
              </span>
              <p className="font-serif text-xl leading-snug text-foreground">{line.original}</p>
            </li>
          ))}
        </ol>
      </TabsContent>
    </CardContent>
  </Tabs>
);

export default LyricsViewer;
