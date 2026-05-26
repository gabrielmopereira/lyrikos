import type { Lyrics } from "@/lib/api";

const LRC_TIME_REGEX = /^\[(\d+):(\d+)(?:[.:]\d+)?\]/v;

type LyricRow = { index: number; original: string; time?: string };

const extractLrcTime = (raw: string): string | undefined => {
  const match = LRC_TIME_REGEX.exec(raw);

  if (!match) {
    return undefined;
  }

  const [, minutes, seconds] = match;
  return `${Number.parseInt(minutes, 10)}:${seconds.padStart(2, "0")}`;
};

// Splits plainLyrics row-by-row (preserving empty rows so indices align with API segments),
// then attaches timestamps from the same row of syncedLyrics when present.
const parseLyrics = (lyrics: Lyrics): Array<LyricRow> => {
  if (!lyrics.plainLyrics) {
    return [];
  }

  const syncedRows = lyrics.syncedLyrics?.split("\n") ?? [];

  return lyrics.plainLyrics.split("\n").map((raw, index) => {
    const time = extractLrcTime(syncedRows[index] ?? "");
    const row: LyricRow = { index, original: raw.trim() };

    if (time) {
      row.time = time;
    }

    return row;
  });
};

// Formats a track duration (in seconds) as `m:ss` for the track header.
const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export type { LyricRow };
export { formatDuration, parseLyrics };
