import type { TrackLyrics } from "@/lib/api";
import type { LyricLine } from "@/types/lyrics";

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

const parsePlainLyrics = (plain: string): Array<LyricLine> =>
  plain
    .split("\n")
    .map((raw) => raw.trim())
    .filter((line) => line !== "")
    .map((line) => ({ original: line, translation: "" }));

const parseLyrics = (lyrics: TrackLyrics): Array<LyricLine> => {
  if (lyrics.syncedLyrics) {
    return parseSyncedLyrics(lyrics.syncedLyrics);
  }

  if (lyrics.plainLyrics) {
    return parsePlainLyrics(lyrics.plainLyrics);
  }

  return [];
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export { formatDuration, parseLyrics };
