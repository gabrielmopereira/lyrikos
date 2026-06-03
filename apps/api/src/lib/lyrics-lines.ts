// Prefixes every line with its zero-based, zero-padded index and a `|` separator.
// Both the research and translation prompts share this so that any field keyed by
// line index (e.g. `wordplay.lineIndex`, translation segment alignment) becomes a
// copy-from-prompt task for the model rather than an error-prone newline count.
export const formatLinesWithIndex = (
  plainLyrics: string,
): { formatted: string; lineCount: number } => {
  const lines = plainLyrics.split("\n");
  const width = String(Math.max(lines.length - 1, 0)).length;
  const formatted = lines
    .map((line, index) => `${String(index).padStart(width, "0")} | ${line}`)
    .join("\n");

  return { formatted, lineCount: lines.length };
};
