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
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <p className="mb-4 text-sm text-muted-foreground">
        {result.data.length} of {result.total} results for &ldquo;{query}&rdquo;
      </p>

      <ul className="flex flex-col gap-1">
        {result.data.map((track) => (
          <li key={track.deezerId}>
            <Link
              className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"
              href={`/songs/${track.deezerId}`}
            >
              <div
                aria-hidden
                className="size-12 shrink-0 rounded bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url(${track.albumCover})` }}
              />

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{track.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {track.artistName} · {track.albumName}
                </span>
              </div>

              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(track.duration)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchResults;
