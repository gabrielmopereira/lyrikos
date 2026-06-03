import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { LyricsStatus } from "@repo/db";
import { streamSSE } from "hono/streaming";

import { isRegionSpecificLanguageTag } from "@/lib/language";
import { logger } from "@/lib/logger";
import { AppError } from "@/middleware/error-handler";
import { deezerService } from "@/services/deezer.service";
import { lyricsService } from "@/services/lyrics.service";
import { pipelineService } from "@/services/pipeline.service";
import { trackService } from "@/services/track.service";
import { translationSegmentSchema } from "@/services/translation.prompt";
import { translationService } from "@/services/translation.service";

const lyricsSchema = z
  .object({
    contentHash: z.string().nullable(),
    errorMessage: z.string().nullable(),
    fetchedAt: z.date().nullable(),
    language: z.string().nullable(),
    plainLyrics: z.string().nullable(),
    status: z.enum(LyricsStatus),
    syncedLyrics: z.string().nullable(),
  })
  .openapi("Lyrics");
type Lyrics = z.infer<typeof lyricsSchema>;

const trackSchema = z
  .object({
    albumCover: z.url(),
    albumId: z.string(),
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

const translationSchema = z
  .object({
    downvotes: z.number(),
    generatedAt: z.date(),
    id: z.string(),
    language: z.string(),
    segments: z.array(translationSegmentSchema),
    selfScore: z.number().nullable(),
    translatorNote: z.string().nullable(),
    upvotes: z.number(),
  })
  .openapi("Translation");
type Translation = z.infer<typeof translationSchema>;

const trackViewSchema = z
  .object({
    lyrics: lyricsSchema.nullable(),
    track: trackSchema,
    translation: translationSchema.nullable(),
  })
  .openapi("TrackView");

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

const targetLanguageQuery = z.object({
  lang: z.string().refine(isRegionSpecificLanguageTag, {
    message: "lang must be a BCP 47 tag with a region subtag (e.g., 'pt-BR')",
  }),
});

const v1TrackRoutes = new OpenAPIHono();

const trackRoute = createRoute({
  description: "Returns the track from the database.",
  method: "get",
  path: "/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: trackSchema } },
      description: "Track data",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Track not found",
    },
  },
  summary: "Get a track by Deezer ID (read-only)",
  tags: ["Track"],
});

v1TrackRoutes.openapi(trackRoute, async (c) => {
  const { id } = c.req.valid("param");
  const track = await trackService.findById(id);

  if (!track) {
    throw new AppError("Track not found", 404, true, "NOT_FOUND");
  }

  return c.json(track, 200);
});

const trackLyricsRoute = createRoute({
  description: "Returns the lyrics from the database.",
  method: "get",
  path: "/{id}/lyrics",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: lyricsSchema } },
      description: "Track lyrics",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Track or lyrics not found",
    },
  },
  summary: "Get a track's lyrics by Deezer ID (read-only)",
  tags: ["Track"],
});

v1TrackRoutes.openapi(trackLyricsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const lyrics = await lyricsService.findByTrack(id);

  if (!lyrics) {
    throw new AppError("Lyrics not found", 404, true, "NOT_FOUND");
  }

  return c.json(lyrics, 200);
});

const trackViewRoute = createRoute({
  description: "Bundle endpoint: returns track and cached translation for the target language.",
  method: "get",
  path: "/{id}/view",
  request: {
    params: z.object({ id: z.string() }),
    query: targetLanguageQuery,
  },
  responses: {
    200: {
      content: { "application/json": { schema: trackViewSchema } },
      description: "Track view bundle",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid language",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Track not found",
    },
  },
  summary: "Get the cached track view for a target language (read-only)",
  tags: ["Track"],
});

v1TrackRoutes.openapi(trackViewRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { lang } = c.req.valid("query");

  let track = await trackService.findById(id);

  if (!track) {
    const deezerTrack = await deezerService.getTrack(id);
    const createInput = trackService.deezerTrackToTrackCreateInput(deezerTrack);

    track = await trackService.create(createInput);
  }

  const lyrics: Lyrics | null = await lyricsService.findByTrack(id);

  const rawTranslation = await translationService.findByTrackAndLanguage(id, lang);

  let translation: Translation | null = null;

  if (rawTranslation) {
    const parsed = translationSchema.safeParse(rawTranslation);

    if (parsed.success) {
      translation = parsed.data;
    } else {
      // A pre-v3 row no longer satisfies the current segment contract. Treat it as
      // absent so the client falls back to the pipeline and regenerates at the
      // current prompt version instead of surfacing a 500.
      logger.warn(
        { error: parsed.error, lang, trackId: id },
        "Stored translation failed the current schema; treating as missing",
      );
    }
  }

  const response = {
    lyrics,
    track,
    translation,
  };

  return c.json(response, 200);
});

v1TrackRoutes.get("/:id/pipeline", async (c) => {
  const id = c.req.param("id");
  const lang = c.req.query("lang");

  if (!lang || !isRegionSpecificLanguageTag(lang)) {
    throw new AppError(
      "lang query parameter must be a BCP 47 tag with a region subtag (e.g., 'pt-BR')",
      400,
      true,
      "INVALID_LANGUAGE",
    );
  }

  const track = await trackService.findById(id);

  if (!track) {
    throw new AppError(
      `Track ${id} not found; ingest it before running the pipeline`,
      404,
      true,
      "NOT_FOUND",
    );
  }

  return streamSSE(
    c,
    async (stream) => {
      try {
        for await (const event of pipelineService.run({ targetLanguage: lang, track })) {
          if (stream.aborted || stream.closed) {
            break;
          }

          await stream.writeSSE({
            data: JSON.stringify(event),
            event: `${event.phase}:${event.status}`,
          });
        }
      } catch (error) {
        logger.error({ error, lang, trackId: id }, "Pipeline stream crashed");

        if (!stream.aborted && !stream.closed) {
          await stream.writeSSE({
            data: JSON.stringify({
              code: error instanceof AppError ? error.code : "UNKNOWN_ERROR",
              message:
                error instanceof Error ? error.message : "Pipeline stream crashed unexpectedly",
            }),
            event: "pipeline:crashed",
          });
        }
      }
    },
    async (error, stream) => {
      logger.error({ error, lang, trackId: id }, "Pipeline SSE writer error");

      if (!stream.aborted && !stream.closed) {
        await stream.writeSSE({
          data: JSON.stringify({ code: "SSE_WRITER_ERROR", message: error.message }),
          event: "pipeline:crashed",
        });
      }
    },
  );
});

export { v1TrackRoutes };
