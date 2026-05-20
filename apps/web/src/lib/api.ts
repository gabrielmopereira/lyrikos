import { z } from "zod";

const searchTrack = z.object({
  albumCover: z.url(),
  albumName: z.string(),
  artistName: z.string(),
  duration: z.number(),
  explicitLyrics: z.boolean(),
  id: z.string(),
  title: z.string(),
});
type SearchTrack = z.infer<typeof searchTrack>;

const searchResponseSchema = z.object({
  data: z.array(searchTrack),
  total: z.number(),
});
type SearchResponse = z.infer<typeof searchResponseSchema>;

const trackSchema = z.object({
  albumCover: z.url(),
  albumName: z.string(),
  artistId: z.string(),
  artistName: z.string(),
  duration: z.number(),
  explicitLyrics: z.boolean(),
  id: z.string(),
  isrc: z.string(),
  shortTitle: z.string(),
  title: z.string(),
});
type Track = z.infer<typeof trackSchema>;

const lyricsStatusSchema = z.enum([
  "PENDING",
  "AVAILABLE",
  "INSTRUMENTAL",
  "NOT_FOUND",
  "FETCH_FAILED",
]);
type LyricsStatus = z.infer<typeof lyricsStatusSchema>;

const trackLyricsSchema = z.object({
  language: z.string().nullable(),
  plainLyrics: z.string().nullable(),
  status: lyricsStatusSchema,
  syncedLyrics: z.string().nullable(),
});
type TrackLyrics = z.infer<typeof trackLyricsSchema>;

const getApiUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  return url;
};

const searchTracks = async (
  query: string,
  limit: number,
  init?: { signal?: AbortSignal },
): Promise<SearchResponse> => {
  const params = new URLSearchParams({ limit: String(limit), q: query });
  const response = await fetch(`${getApiUrl()}/api/v1/search?${params.toString()}`, {
    cache: "no-store",
    signal: init?.signal,
  });

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const data = await response.json();
  return searchResponseSchema.parse(data);
};

const getTrack = async (id: string, init?: { signal?: AbortSignal }): Promise<Track | null> => {
  const response = await fetch(`${getApiUrl()}/api/v1/track/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: init?.signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Track request failed with status ${response.status}`);
  }

  const data = await response.json();
  return trackSchema.parse(data);
};

const getTrackLyrics = async (
  id: string,
  init?: { signal?: AbortSignal },
): Promise<TrackLyrics | null> => {
  const response = await fetch(`${getApiUrl()}/api/v1/track/${encodeURIComponent(id)}/lyrics`, {
    cache: "no-store",
    signal: init?.signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Lyrics request failed with status ${response.status}`);
  }

  const data = await response.json();
  return trackLyricsSchema.parse(data);
};

export type { SearchTrack, SearchResponse, Track, TrackLyrics, LyricsStatus };
export { searchTracks, getTrack, getTrackLyrics };
