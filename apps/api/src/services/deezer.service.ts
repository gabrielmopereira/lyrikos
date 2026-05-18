import { z } from "zod";

import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";

const deezerArtistSchema = z.object({
  id: z.number(),
  name: z.string(),
  picture_big: z.url(),
  picture_medium: z.url(),
  picture_small: z.url(),
  picture_xl: z.url(),
});
type DeezerArtist = z.infer<typeof deezerArtistSchema>;

const deezerAlbumSchema = z.object({
  cover_big: z.url(),
  cover_medium: z.url(),
  cover_small: z.url(),
  cover_xl: z.url(),
  id: z.number(),
  title: z.string(),
});
type DeezerAlbum = z.infer<typeof deezerAlbumSchema>;

const deezerSearchTrackSchema = z.object({
  album: deezerAlbumSchema,
  artist: deezerArtistSchema,
  duration: z.number(),
  explicit_lyrics: z.boolean(),
  id: z.number(),
  isrc: z.string(),
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

const deezerTrackSchema = z.object({
  album: deezerAlbumSchema,
  artist: deezerArtistSchema,
  contributors: z.array(
    z.object({
      ...deezerArtistSchema.shape,
      role: z.string(),
    }),
  ),
  duration: z.number(),
  explicit_lyrics: z.boolean(),
  id: z.number(),
  isrc: z.string(),
  readable: z.boolean(),
  release_date: z.iso.date(),
  title: z.string(),
  title_short: z.string(),
});
type DeezerTrackResponse = z.infer<typeof deezerTrackSchema>;

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

const DEFAULT_LIMIT = 10 as const;
const DEEZER_TIMEOUT = 5000 as const;

export class DeezerService {
  private readonly baseUrl: string = "https://api.deezer.com";
  private readonly path = {
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

      const url = `${this.baseUrl}/${this.path.search}?${params.toString()}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(DEEZER_TIMEOUT) });

      if (!response.ok) {
        logger.error(
          { body: await response.text(), query, status: response.status },
          "Deezer fetch failed",
        );
        throw new AppError("Failed to fetch data", 502, true, "DEEZER_UPSTREAM_ERROR");
      }

      const data = await response.json();
      const result = deezerSearchResponseSchema.safeParse(data);

      if (!result.success) {
        logger.error({ issues: result.error.issues, query }, "Failed to parse response");
        throw new AppError("Failed to parse response", 500, false, "PARSE_ERROR");
      }

      return result.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, query }, "Failed to search");
      throw new AppError("Failed to search", 500, false, "SEARCH_ERROR");
    }
  }

  async getTrack(id: string) {
    try {
      const url = `${this.baseUrl}/${this.path.track}/${id}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (!response.ok) {
        logger.error({ id, status: response.status }, "Failed to fetch track");
        throw new AppError("Failed to fetch track", 502, true, "DEEZER_UPSTREAM_ERROR");
      }

      const data = await response.json();

      if ((data as { error?: { code?: number } }).error?.code === 800) {
        throw new AppError("Track not found", 404, true, "TRACK_NOT_FOUND");
      }

      const parsedData = deezerTrackSchema.safeParse(data);

      if (!parsedData.success) {
        logger.error({ id, issues: parsedData.error.issues }, "Failed to parse track");
        throw new AppError("Failed to parse track", 500, false, "PARSE_ERROR");
      }

      return parsedData.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, id }, "Failed to fetch track");
      throw new AppError("Failed to fetch track", 500, false, "UNKNOWN_ERROR");
    }
  }
}

export type {
  DeezerArtist,
  DeezerAlbum,
  DeezerSearchTrack,
  DeezerSearchResponse,
  DeezerTrackResponse,
};
export const deezerService = new DeezerService();
