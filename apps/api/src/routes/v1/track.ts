import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Prisma } from "@repo/db";

import type { DeezerTrackResponse } from "@/services/deezer.service";
import { deezerService } from "@/services/deezer.service";
import { trackService } from "@/services/track.service";

// Need to add relations
const trackSchema = z
  .object({
    albumCover: z.url(),
    albumName: z.string(),
    artistId: z.string(),
    artistName: z.string(),
    createdAt: z.date(),
    duration: z.number(),
    explicitLyrics: z.boolean(),
    id: z.string(),
    isrc: z.string(),
    shortTitle: z.string(),
    title: z.string(),
    updatedAt: z.date(),
  })
  .openapi("Track");

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

const v1TrackRoutes = new OpenAPIHono();

const deezerTrackToCreateInput = (deezerTrack: DeezerTrackResponse): Prisma.TrackCreateInput => ({
  albumCover: deezerTrack.album.cover_medium,
  albumId: String(deezerTrack.album.id),
  albumName: deezerTrack.album.title,
  artistId: String(deezerTrack.artist.id),
  artistName: deezerTrack.artist.name,
  duration: deezerTrack.duration,
  explicitLyrics: deezerTrack.explicit_lyrics,
  id: String(deezerTrack.id),
  isrc: deezerTrack.isrc,
  shortTitle: deezerTrack.title_short,
  title: deezerTrack.title,
});

const trackRoute = createRoute({
  description: "Returns the track data from the database, falling back to Deezer when missing.",
  method: "get",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: trackSchema } },
      description: "Track data",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid query parameters",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Track not found",
    },
  },
  summary: "Get a track by Deezer ID",
  tags: ["Track"],
});

v1TrackRoutes.openapi(trackRoute, async (c) => {
  const { id } = c.req.valid("param");

  const storedTrack = await trackService.findById(id);

  if (storedTrack) {
    return c.json(storedTrack, 200);
  }

  const deezerTrack = await deezerService.getTrack(id);
  const trackCreateInput = deezerTrackToCreateInput(deezerTrack);

  const createdTrack = await trackService.create(trackCreateInput);

  return c.json(createdTrack, 200);
});

export { v1TrackRoutes };
