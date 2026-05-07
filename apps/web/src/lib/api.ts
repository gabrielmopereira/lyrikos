import { z } from "zod";

const trackSchema = z.object({
  albumCover: z.url(),
  albumName: z.string(),
  artistName: z.string(),
  deezerId: z.string(),
  duration: z.number(),
  explicitLyrics: z.boolean(),
  title: z.string(),
});

const searchResponseSchema = z.object({
  data: z.array(trackSchema),
  total: z.number(),
});

type Track = z.infer<typeof trackSchema>;
type SearchResponse = z.infer<typeof searchResponseSchema>;

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

export type { Track, SearchResponse };
export { searchTracks };
