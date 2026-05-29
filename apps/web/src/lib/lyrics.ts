import type { Lyrics } from "@/lib/api";

const LRC_TIME_REGEX = /^\[(\d+):(\d+)(?:[.:]\d+)?\]/v;

type LyricRow = { index: number; original: string; time?: string };

const parseLrcLine = (raw: string): { content: string; time: string } | undefined => {
  const match = LRC_TIME_REGEX.exec(raw);

  if (!match) {
    return undefined;
  }

  const [whole, minutes, seconds] = match;
  return {
    content: raw.slice(whole.length).trim(),
    time: `${Number.parseInt(minutes, 10)}:${seconds.padStart(2, "0")}`,
  };
};

// plainLyrics line indices align with translation segment indices (it may include
// paragraph-break blanks). syncedLyrics omits those blanks and can carry a trailing
// empty timestamp marker. Sequence-match by walking non-empty content lines in order.
const parseLyrics = (lyrics: Lyrics): Array<LyricRow> => {
  if (!lyrics.plainLyrics) {
    return [];
  }

  const syncedTimestamps = (lyrics.syncedLyrics?.split("\n") ?? []).flatMap((raw) => {
    const parsed = parseLrcLine(raw);
    return parsed && parsed.content !== "" ? [parsed.time] : [];
  });

  let cursor = 0;
  return lyrics.plainLyrics.split("\n").map((raw, index) => {
    const trimmed = raw.trim();
    const row: LyricRow = { index, original: trimmed };

    if (trimmed !== "") {
      const time = syncedTimestamps[cursor];
      if (time !== undefined) {
        row.time = time;
      }
      cursor += 1;
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
