import Image from "next/image";
import Link from "next/link";

import type { SearchResponse } from "@/lib/api";

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

type Props = {
  query: string;
  result: SearchResponse | null;
};

const SearchResults = ({ query, result }: Props) => {
  if (!query) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Type a song or artist in the search bar above.
      </p>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No results for &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <>
      {result.data.map((track) => (
        <li className="border-border not-last:border-b" key={track.deezerId}>
          <Link className="flex items-center gap-4 px-7 py-3" href={`/songs/${track.deezerId}`}>
            <Image
              alt={track.albumName}
              className="shrink-0 rounded-tile"
              height={56}
              src={track.albumCover}
              width={56}
            />

            <div className="flex min-w-0 flex-2 flex-col">
              <span className="truncate font-serif text-lg font-medium text-nowrap">
                {track.title}
              </span>
              <span className="text-sm text-primary">{track.artistName}</span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col text-end">
              <span className="truncate text-xs text-muted-foreground uppercase">
                {track.albumName}
              </span>
              <span className="text-xs text-marble-faint">
                {track.explicitLyrics && (
                  <>
                    <span className="text-secondary">Explicit</span>
                    <span className="px-1">&bull;</span>
                  </>
                )}
                <span className="tabular-nums">{formatDuration(track.duration)}</span>
              </span>
            </div>
          </Link>
        </li>
      ))}
    </>
  );
};

export default SearchResults;
