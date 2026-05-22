import { z } from "zod";

import { logger } from "@/lib/logger";

import { version } from "../../package.json" with { type: "json" };

const LRCLIB_USER_AGENT = `Lyrikos v${version} (https://github.com/gabrielmopereira/lyrikos)"`;
const LRCLIB_TIMEOUT = 20_000;

const getLyricsResponseSchema = z.object({
  albumName: z.string(),
  artistName: z.string(),
  duration: z.number(),
  id: z.number(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
  trackName: z.string(),
});
type GetLyricsResponse = z.infer<typeof getLyricsResponseSchema>;

type LrclibResult =
  | { data: GetLyricsResponse; kind: "found" }
  | { kind: "not_found" }
  | { errorMessage: string; kind: "failed" };

export class LrclibService {
  private baseUrl = "https://lrclib.net/api/";
  private path = {
    get: "get",
    getCached: "get-cached",
  };
  private headers = {
    "User-Agent": LRCLIB_USER_AGENT,
  };

  async getLyrics(
    trackName: string,
    artistName: string,
    albumName: string,
    duration: number,
  ): Promise<LrclibResult> {
    const searchParams = new URLSearchParams({
      album_name: albumName,
      artist_name: artistName,
      duration: duration.toString(),
      track_name: trackName,
    });
    const url = `${this.baseUrl}${this.path.get}?${searchParams.toString()}`;

    let response: Response;

    try {
      response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(LRCLIB_TIMEOUT),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network error";

      logger.error(
        { albumName, artistName, error, trackName },
        "Lrclib request failed before response",
      );

      return { errorMessage, kind: "failed" };
    }

    if (response.status === 404) {
      logger.info({ albumName, artistName, duration, trackName }, "Track lyrics not found");
      return { kind: "not_found" };
    }

    if (!response.ok) {
      logger.error({ body: await response.text(), status: response.status }, "Lrclib fetch failed");
      return { errorMessage: `Upstream returned ${response.status}`, kind: "failed" };
    }

    const parsed = getLyricsResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, "Lrclib response parsing failed");
      return { errorMessage: "Invalid upstream response shape", kind: "failed" };
    }

    logger.info({ albumName, artistName, duration, trackName }, "Track lyrics found");
    return { data: parsed.data, kind: "found" };
  }
}

export type { GetLyricsResponse, LrclibResult };
export const lrclibService = new LrclibService();
