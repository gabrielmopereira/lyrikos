import { Card } from "@repo/ui/components/card";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getTrack, getTrackLyrics, type LyricsStatus, type TrackLyrics } from "@/lib/api";

import LyricsViewer, { type LyricLine } from "./_components/lyrics-viewer";

const LRC_LINE_REGEX = /^\[(\d+):(\d+)(?:[.:]\d+)?\](.*)$/v;

const parseSyncedLyrics = (synced: string): Array<LyricLine> =>
  synced
    .split("\n")
    .map((raw): LyricLine | null => {
      const match = LRC_LINE_REGEX.exec(raw);
      if (!match) {
        return null;
      }
      const [, minutes, seconds, text] = match;
      const trimmed = text.trim();
      if (!trimmed) {
        return null;
      }
      return {
        original: trimmed,
        time: `${Number.parseInt(minutes, 10)}:${seconds.padStart(2, "0")}`,
        translation: "",
      };
    })
    .filter((line): line is LyricLine => line !== null);

const LYRICS_FALLBACK_MESSAGES: Record<LyricsStatus, string> = {
  AVAILABLE: "Lyrics are available but couldn't be displayed.",
  FETCH_FAILED: "Couldn't fetch lyrics — try again later.",
  INSTRUMENTAL: "This track is instrumental.",
  NOT_FOUND: "No lyrics found for this track yet.",
  PENDING: "Lyrics are being fetched…",
};

const lyricsFallbackMessage = (lyrics: TrackLyrics | null): string =>
  lyrics ? LYRICS_FALLBACK_MESSAGES[lyrics.status] : "Lyrics are not available for this track yet.";

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

type Props = {
  params: Promise<{ id: string }>;
};

const TrackPage = async ({ params }: Props) => {
  const { id } = await params;
  const track = await getTrack(id);

  if (!track) {
    notFound();
  }

  const lyrics = await getTrackLyrics(id);
  const lines: Array<LyricLine> =
    lyrics?.status === "AVAILABLE" && lyrics.syncedLyrics
      ? parseSyncedLyrics(lyrics.syncedLyrics)
      : [];

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

      {lines.length > 0 ? (
        <Card className="min-h-0">
          <LyricsViewer
            lines={lines}
            sourceLabel={language.source.label}
            targetLabel={language.target.label}
          />
        </Card>
      ) : (
        <Card className="min-h-0 p-8 text-center font-mono text-xs tracking-widest text-marble-dim uppercase">
          {lyricsFallbackMessage(lyrics)}
        </Card>
      )}
    </main>
  );
};

export default TrackPage;
