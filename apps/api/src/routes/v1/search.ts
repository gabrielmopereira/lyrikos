import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import type { DeezerSearchTrack } from "@/services/deezer.service";
import { deezerService } from "@/services/deezer.service";

const trackSchema = z
  .object({
    albumCover: z.url(),
    albumName: z.string(),
    artistName: z.string(),
    deezerId: z.string(),
    duration: z.number(),
    explicitLyrics: z.boolean(),
    title: z.string(),
  })
  .openapi("Track");
type Track = z.infer<typeof trackSchema>;

const searchQuerySchema = z
  .object({
    limit: z.coerce.number().min(1).max(100).default(20).openapi({
      description: "Number of results to return",
      example: 20,
    }),
    q: z.string().min(1).max(100).openapi({
      description: "Search term - track title, artist or album",
      example: "Brutalismus 3000",
    }),
  })
  .openapi("Search Query");

const searchResponseSchema = z
  .object({
    data: z.array(trackSchema),
    total: z.number(),
  })
  .openapi("Search Response");

const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
      message: z.string(),
      stack: z.string().optional(),
    }),
  })
  .openapi("Error");

const v1SearchRoutes = new OpenAPIHono();

const deezerToTrack = (deezerSearchTrack: DeezerSearchTrack): Track => ({
  albumCover: deezerSearchTrack.album.cover_medium,
  albumName: deezerSearchTrack.album.title,
  artistName: deezerSearchTrack.artist.name,
  deezerId: String(deezerSearchTrack.id),
  duration: deezerSearchTrack.duration,
  explicitLyrics: deezerSearchTrack.explicit_lyrics,
  title: deezerSearchTrack.title,
});

const searchRoute = createRoute({
  description: "Returns the search results",
  method: "get",
  path: "/",
  request: {
    query: searchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: searchResponseSchema } },
      description: "Search results",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid query parameters",
    },
  },
  summary: "Search a query and returns matching tracks",
  tags: ["Search"],
});

v1SearchRoutes.openapi(searchRoute, async (c) => {
  const { limit, q } = c.req.valid("query");
  const deezerResponse = await deezerService.search(q, limit);
  return c.json(
    {
      data: deezerResponse.data.map(deezerToTrack),
      total: deezerResponse.total,
    },
    200,
  );
});

export { v1SearchRoutes };
