import { Card } from "@repo/ui/components/card";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getTrack } from "@/lib/api";

import LyricsViewer, { type LyricLine } from "./_components/lyrics-viewer";

// TODO: save user preference for lyrics display
// TODO: Add share button

const language = {
  source: { code: "EN", label: "English" },
  target: { code: "EL", label: "Ελληνικά" },
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const lines: Array<LyricLine> = [
  { original: "Stay all weekend", time: "0:18", translation: "Μείνε όλο το σαββατοκύριακο" },
  {
    note: "Greek τηγανίτες are closer to crêpes than US pancakes — a soft mistranslation chosen for cultural resonance.",
    original: "We'll get pancakes",
    time: "0:24",
    translation: "Θα φτιάξουμε τηγανίτες",
  },
  { original: "I'll buy an old van", time: "0:31", translation: "Θα αγοράσω ένα παλιό φορτηγάκι" },
  {
    original: "We'll drive to the canyon",
    time: "0:38",
    translation: "Θα οδηγήσουμε μέχρι το φαράγγι",
  },
  {
    note: "'Down to Mexico' — directional 'down' doesn't carry a geographic sense in Greek, so it lands as 'all the way down.'",
    original: "And maybe down to Mexico",
    time: "0:46",
    translation: "Και ίσως μέχρι κάτω στο Μεξικό",
  },
  { original: "Quiet company", time: "0:54", translation: "Σιωπηλή συντροφιά" },
  { original: "Nothing said", time: "1:02", translation: "Τίποτα ειπωμένο" },
  { original: "We've got time", time: "1:09", translation: "Έχουμε χρόνο" },
  {
    original: "And the static on the radio",
    time: "1:18",
    translation: "Και ο στατικός θόρυβος στο ραδιόφωνο",
  },
  {
    original: "Will keep us company tonight",
    time: "1:26",
    translation: "Θα μας κρατάει συντροφιά απόψε",
  },
  { original: "Just stay another day", time: "1:34", translation: "Απλά μείνε άλλη μια μέρα" },
  { original: "And we'll find a way", time: "1:42", translation: "Και θα βρούμε τρόπο" },
  { original: "To leave it all behind", time: "1:50", translation: "Να αφήσουμε τα πάντα πίσω" },
];

type Props = {
  params: Promise<{ id: string }>;
};

const TrackPage = async ({ params }: Props) => {
  const { id } = await params;
  const track = await getTrack(id);

  if (!track) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-8 p-8">
      <header className="flex items-start gap-8">
        <Image
          alt={track.albumName}
          className="shrink-0 rounded-3xl border border-glass-border shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)]"
          height={192}
          src={track.albumCover}
          width={192}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2 self-end">
          <h1 className="font-serif text-6xl leading-none font-medium tracking-tight">
            {track.title}
          </h1>

          <span className="flex items-baseline gap-4">
            <p className="inline font-serif text-2xl text-primary italic">{track.artistName}</p>
            <p className="inline font-mono text-[11px] tracking-[0.18em] text-marble-dim uppercase">
              {track.albumName} · {formatDuration(track.duration)}
            </p>
          </span>
        </div>

        <Card className="self-end px-5 py-4" size="xs" tone="glass">
          <div className="flex items-center gap-8">
            <span className="font-mono text-[10px] tracking-[0.22em] text-marble-dim uppercase">
              Translation
            </span>

            <div className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1 font-mono text-xs tracking-widest uppercase">
              <span>{language.source.code}</span>
              <span className="text-primary">→</span>
              <span>{language.target.code}</span>
              <ChevronDown className="size-3 text-marble-dim" />
            </div>
          </div>
        </Card>
      </header>

      <Card className="min-h-0">
        <LyricsViewer
          lines={lines}
          sourceLabel={language.source.label}
          targetLabel={language.target.label}
        />
      </Card>
    </main>
  );
};

export default TrackPage;
