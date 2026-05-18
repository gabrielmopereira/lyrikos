import { z } from "zod";

import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";

import { version } from "../../package.json" with { type: "json" };

const LRCLIB_USER_AGENT = `Lyrikos v${version} (https://github.com/gabrielmopereira/lyrikos)"`;
const LRCLIB_TIMEOUT = 20_000;

const getLyricsResponseSchema = z.object({
  albumName: z.string(),
  artistName: z.string(),
  duration: z.number(),
  id: z.number(),
  instrumental: z.boolean(),
  plainLyrics: z.string(),
  syncedLyrics: z.string().optional(),
  trackName: z.string(),
});
type GetLyricsResponse = z.infer<typeof getLyricsResponseSchema>;

export class LrclibService {
  private baseUrl = "https://lrclib.net/api/";
  private path = {
    get: "get",
    getCached: "get-cached",
  };
  private headers = {
    "User-Agent": LRCLIB_USER_AGENT,
  };

  async getLyrics(trackName: string, artistName: string, albumName: string, duration: number) {
    try {
      const searchParams = new URLSearchParams({
        album_name: albumName,
        artist_name: artistName,
        duration: duration.toString(),
        track_name: trackName,
      });

      const url = `${this.baseUrl}${this.path.get}?${searchParams.toString()}`;
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(LRCLIB_TIMEOUT),
      });

      if (response.status === 404) {
        logger.info({ albumName, artistName, duration, trackName }, "Track lyrics not found");
        return null;
      }

      if (!response.ok) {
        logger.error(
          { body: await response.text(), status: response.status },
          "Lrclib fetch failed",
        );
        throw new AppError("Failed to fetch data", 502, true, "LRCLIB_UPSTREAM_ERROR");
      }

      const data = await response.json();
      const result = getLyricsResponseSchema.safeParse(data);

      if (!result.success) {
        logger.error({ issues: result.error.issues }, "Lrclib response parsing failed");
        throw new AppError("Failed to parse data", 502, true, "LRCLIB_UPSTREAM_ERROR");
      }

      logger.info({ albumName, artistName, duration, trackName }, "Track lyrics found");

      return result.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error(error, "Unexpected error");
      throw new AppError("Unexpected error", 500, true, "INTERNAL_SERVER_ERROR");
    }
  }
}

export type { GetLyricsResponse };
export const lrclibService = new LrclibService();
