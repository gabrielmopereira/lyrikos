import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Prisma } from "@repo/db";
import { LyricsStatus } from "@repo/db";

import { AppError } from "@/middleware/error-handler";
import type { DeezerTrackResponse } from "@/services/deezer.service";
import { deezerService } from "@/services/deezer.service";
import { lrclibService } from "@/services/lrclib.service";
import type { LyricsFetchResult } from "@/services/lyrics.service";
import { lyricsService } from "@/services/lyrics.service";
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

const LyricsSchema = z
  .object({
    contentHash: z.string().nullable(),
    errorMessage: z.string().nullable(),
    fetchedAt: z.date().nullable(),
    plainLyrics: z.string().nullable(),
    status: z.enum(LyricsStatus),
    syncedLyrics: z.string().nullable(),
  })
  .openapi("Lyrics");

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

const trackLyricsRoute = createRoute({
  description: "Returns the track lyrics from the database, falling back to LRCLIB when missing.",
  method: "get",
  path: "/{id}/lyrics",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: LyricsSchema } },
      description: "Track lyrics",
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
  summary: "Get a track lyrics by Deezer ID",
  tags: ["Track"],
});

v1TrackRoutes.openapi(trackLyricsRoute, async (c) => {
  const { id } = c.req.valid("param");

  const storedLyrics = await lyricsService.findByTrackId(id);

  if (storedLyrics) {
    return c.json(storedLyrics, 200);
  }

  const track = await trackService.findById(id);

  if (!track) {
    throw new AppError("Track not found", 404, true, "NOT_FOUND");
  }

  let result: LyricsFetchResult;

  try {
    const lrclibLyrics = await lrclibService.getLyrics(
      track.title,
      track.artistName,
      track.albumName,
      track.duration,
    );

    result = lrclibLyrics ? { data: lrclibLyrics, kind: "found" } : { kind: "not_found" };
  } catch (error) {
    result = {
      errorMessage:
        error instanceof AppError ? error.message : "Unexpected error while fetching lyrics",
      kind: "failed",
    };
  }

  const lyrics = await lyricsService.create({ result, trackId: id });

  return c.json(lyrics, 200);
});

export { v1TrackRoutes };
