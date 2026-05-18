import { z } from "zod";

const searchTrack = z.object({
  albumCover: z.url(),
  albumName: z.string(),
  artistName: z.string(),
  deezerId: z.string(),
  duration: z.number(),
  explicitLyrics: z.boolean(),
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

export type { SearchTrack, SearchResponse, Track };
export { searchTracks, getTrack };
