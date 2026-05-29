import { Card } from "@repo/ui/components/card";
import { cookies } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";

import type { Track, Lyrics, Translation } from "@/lib/api";
import { getTrackView } from "@/lib/api";
import {
  areLanguageTagsMutuallyIntelligible,
  buildLanguageFromCode,
  DEFAULT_TARGET,
  TARGET_LANGUAGE_COOKIE,
} from "@/lib/language";
import { formatDuration } from "@/lib/lyrics";

import { LanguageProvider } from "./_components/language-provider";
import LanguageSelector from "./_components/language-selector";
import LyricsViewer from "./_components/lyrics-viewer";
import PipelineViewer from "./_components/pipeline-viewer";

const Header = ({ track }: { track: Track }) => (
  <header className="flex items-start gap-8">
    <Image
      alt={track.albumName}
      className="shrink-0 rounded-3xl border border-glass-border shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)]"
      height={192}
      src={track.albumCover}
      width={192}
    />

    <div className="flex min-w-0 flex-1 flex-col gap-2 self-end">
      <h1 className="font-serif text-6xl leading-none font-medium tracking-tight">{track.title}</h1>

      <span className="flex items-baseline gap-4 *:inline">
        <p className="font-serif text-2xl text-primary italic">{track.artistName}</p>

        <p className="truncate font-mono text-xs tracking-widest text-nowrap text-marble-dim uppercase">
          {track.albumName}
        </p>

        <p className="font-mono text-xs tracking-widest text-nowrap text-marble-dim">
          · {formatDuration(track.duration)}
        </p>
      </span>
    </div>

    <LanguageSelector />
  </header>
);

type View =
  | { kind: "ready"; lyrics: Lyrics; translation: Translation }
  | { kind: "lyrics-only"; lyrics: Lyrics }
  | { kind: "no-lyrics"; reason: "instrumental" | "not-found" }
  | { kind: "pipeline"; trackId: string };

const defineView = (
  lyrics: Lyrics | null,
  targetLanguageCode: string,
  translation: Translation | null,
  trackId: string,
): View => {
  if (!lyrics) {
    return {
      kind: "pipeline",
      trackId,
    };
  }

  if (lyrics?.status !== "AVAILABLE") {
    switch (lyrics?.status) {
      case "INSTRUMENTAL": {
        return {
          kind: "no-lyrics",
          reason: "instrumental",
        };
      }

      case "NOT_FOUND": {
        return {
          kind: "no-lyrics",
          reason: "not-found",
        };
      }

      default: {
        return {
          kind: "pipeline",
          trackId,
        };
      }
    }
  }

  if (!lyrics?.language) {
    return {
      kind: "pipeline",
      trackId,
    };
  }

  if (areLanguageTagsMutuallyIntelligible(lyrics.language, targetLanguageCode)) {
    return {
      kind: "lyrics-only",
      lyrics,
    };
  }

  if (!translation) {
    return {
      kind: "pipeline",
      trackId,
    };
  }

  return {
    kind: "ready",
    lyrics,
    translation,
  };
};

const LyricsCardBody = ({ view }: { view: View }) => {
  switch (view.kind) {
    case "ready": {
      return <LyricsViewer lyrics={view.lyrics} translation={view.translation} />;
    }

    case "lyrics-only": {
      return <LyricsViewer lyrics={view.lyrics} translation={null} />;
    }

    case "no-lyrics": {
      return <p>No lyrics available for this track yet.</p>;
    }

    case "pipeline": {
      return <PipelineViewer trackId={view.trackId} />;
    }

    default: {
      return <p>Unknown view kind</p>;
    }
  }
};

type Props = {
  params: Promise<{ id: string }>;
};

const Page = async ({ params }: Props) => {
  const { id } = await params;
  const cookieStore = await cookies();

  const targetCookie = cookieStore.get(TARGET_LANGUAGE_COOKIE)?.value;
  const initialTarget = targetCookie ? buildLanguageFromCode(targetCookie) : DEFAULT_TARGET;

  const response = await getTrackView(id, initialTarget.code);

  if (!response) {
    notFound();
  }

  const { lyrics, track, translation } = response;

  if (!track) {
    notFound();
  }

  const view = defineView(lyrics, initialTarget.code, translation, id);

  return (
    <LanguageProvider initialLanguage={lyrics?.language ?? null} initialTarget={initialTarget}>
      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-8 p-8">
        <Header track={track} />

        <Card className="min-h-0 flex-1">
          <LyricsCardBody view={view} />
        </Card>
      </main>
    </LanguageProvider>
  );
};

export default Page;
