import { Card } from "@repo/ui/components/card";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getTrack, getTrackLyrics, type LyricsStatus, type TrackLyrics } from "@/lib/api";
import { formatDuration, parseLyrics } from "@/lib/lyrics";

import { LanguageProvider } from "./_components/language-provider";
import LanguageSelector from "./_components/language-selector";
import LyricsViewer from "./_components/lyrics-viewer";

const LYRICS_FALLBACK_MESSAGES: Record<LyricsStatus, string> = {
  AVAILABLE: "Lyrics are available but couldn't be displayed.",
  FETCH_FAILED: "Couldn't fetch lyrics — try again later.",
  INSTRUMENTAL: "This track is instrumental.",
  NOT_FOUND: "No lyrics found for this track yet.",
  PENDING: "Lyrics are being fetched…",
};

const lyricsFallbackMessage = (lyrics: TrackLyrics | null): string =>
  lyrics ? LYRICS_FALLBACK_MESSAGES[lyrics.status] : "Lyrics are not available for this track yet.";

type Props = {
  params: Promise<{ id: string }>;
};

const Page = async ({ params }: Props) => {
  const { id } = await params;
  const track = await getTrack(id);

  if (!track) {
    notFound();
  }

  const lyrics = await getTrackLyrics(id);
  const lines = lyrics?.status === "AVAILABLE" ? parseLyrics(lyrics) : [];

  return (
    <LanguageProvider
      initialLanguage={lyrics?.language ?? null}
      lyricsStatus={lyrics?.status ?? null}
      trackId={id}
    >
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

          <LanguageSelector />
        </header>

        {lines.length > 0 ? (
          <Card className="min-h-0">
            <LyricsViewer lines={lines} />
          </Card>
        ) : (
          <Card className="min-h-0 p-8 text-center font-mono text-xs tracking-widest text-marble-dim uppercase">
            {lyricsFallbackMessage(lyrics)}
          </Card>
        )}
      </main>
    </LanguageProvider>
  );
};

export default Page;
