import { z } from "zod";

import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";

const deezerSearchTrackSchema = z.object({
  album: z.object({
    cover_big: z.url(),
    cover_medium: z.url(),
    cover_small: z.url(),
    cover_xl: z.url(),
    id: z.number(),
    title: z.string(),
  }),
  artist: z.object({
    id: z.number(),
    name: z.string(),
    picture_big: z.url(),
    picture_medium: z.url(),
    picture_small: z.url(),
    picture_xl: z.url(),
  }),
  duration: z.number(),
  explicit_content_cover: z.number(),
  explicit_content_lyrics: z.number(),
  explicit_lyrics: z.boolean(),
  id: z.number(),
  readable: z.boolean(),
  title: z.string(),
  title_short: z.string(),
});
type DeezerSearchTrack = z.infer<typeof deezerSearchTrackSchema>;

const deezerSearchResponseSchema = z.object({
  data: z.array(deezerSearchTrackSchema),
  next: z.url().optional(),
  total: z.number(),
});
type DeezerSearchResponse = z.infer<typeof deezerSearchResponseSchema>;

enum OrderBy {
  ALBUM_ASC = "ALBUM_ASC",
  ALBUM_DESC = "ALBUM_DESC",
  ARTIST_ASC = "ARTIST_ASC",
  ARTIST_DESC = "ARTIST_DESC",
  DURATION_ASC = "DURATION_ASC",
  DURATION_DESC = "DURATION_DESC",
  RANKING = "RANKING",
  RATING_ASC = "RATING_ASC",
  RATING_DESC = "RATING_DESC",
  TRACK_ASC = "TRACK_ASC",
  TRACK_DESC = "TRACK_DESC",
}

const DEFAULT_LIMIT = 10;

export class DeezerService {
  private readonly baseUrl: string = "https://api.deezer.com";
  private readonly endpoint = {
    search: "search",
    track: "track",
  };

  async search(query: string, limit: number = DEFAULT_LIMIT, index: number = 0, order?: OrderBy) {
    try {
      const params = new URLSearchParams({
        index: index.toString(),
        limit: limit.toString(),
        q: query,
      });

      if (order) {
        params.set("order", order);
      }

      const url = `${this.baseUrl}/${this.endpoint.search}?${params.toString()}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (!response.ok) {
        logger.error(
          { body: await response.json(), query, status: response.status },
          "Deezer fetch failed",
        );
        throw new AppError("Failed to fetch data", 502, true, "DEEZER_UPSTREAM_ERROR");
      }

      const data = await response.json();
      const parsedData = deezerSearchResponseSchema.safeParse(data);

      if (!parsedData.success) {
        logger.error({ issues: parsedData.error.issues, query }, "Failed to parse response");
        throw new AppError("Failed to parse response", 500, false, "PARSE_ERROR");
      }

      return parsedData.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, query }, "Failed to search");
      throw new AppError("Failed to search", 500, false, "SEARCH_ERROR");
    }
  }
}

export type { DeezerSearchTrack, DeezerSearchResponse };
export const deezerService = new DeezerService();
