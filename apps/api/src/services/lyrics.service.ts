import { prisma } from "@repo/db";
import type { Prisma } from "@repo/db";
import { sha256 } from "hono/utils/crypto";

import { logger } from "@/lib/logger";
import { AppError, isPrismaKnownError } from "@/middleware/error-handler";
import type { LrclibResult } from "@/services/lrclib.service";

export class LyricsService {
  async findByTrack(trackId: string) {
    try {
      const track = await prisma.lyrics.findUnique({
        where: { trackId },
      });

      return track;
    } catch (error) {
      logger.error({ error, trackId }, "Failed to find lyrics by track ID");
      throw new AppError("Failed to fetch lyrics", 500, false, "LYRICS_FETCH_ERROR");
    }
  }

  private async parseResult(
    result: LrclibResult,
    createInput: Prisma.LyricsCreateInput,
    attemptedAt: Date,
  ) {
    switch (result.kind) {
      case "not_found": {
        createInput.status = "NOT_FOUND";
        break;
      }

      case "failed": {
        createInput.status = "FETCH_FAILED";
        createInput.errorMessage = result.errorMessage;
        break;
      }

      case "found": {
        createInput.fetchedAt = attemptedAt;
        createInput.errorMessage = null;

        if (result.data.instrumental) {
          createInput.status = "INSTRUMENTAL";
        } else {
          createInput.status = "AVAILABLE";
          createInput.plainLyrics = result.data.plainLyrics;
          createInput.syncedLyrics = result.data.syncedLyrics;
          createInput.contentHash = await sha256(
            result.data.syncedLyrics ?? result.data.plainLyrics,
          );
        }

        break;
      }

      default: {
        break;
      }
    }
  }

  async create({ result, trackId }: { result: LrclibResult; trackId: string }) {
    try {
      const existing = await prisma.lyrics.findUnique({ where: { trackId } });

      if (existing) {
        throw new AppError("Lyrics already exist", 400, true, "LYRICS_ALREADY_EXIST");
      }

      const attemptedAt = new Date();

      const createInput: Prisma.LyricsCreateInput = {
        attemptCount: 1,
        lastAttemptAt: attemptedAt,
        track: { connect: { id: trackId } },
      };

      await this.parseResult(result, createInput, attemptedAt);

      try {
        const lyrics = await prisma.lyrics.create({ data: createInput });

        logger.info({ lyricsId: lyrics.id, trackId }, "Lyrics created successfully");

        return lyrics;
      } catch (error) {
        if (isPrismaKnownError(error) && error.code === "P2002") {
          const lyrics = await prisma.lyrics.findUniqueOrThrow({ where: { trackId } });

          logger.info({ lyricsId: lyrics.id }, "Lyrics already exists");

          return lyrics;
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, result }, "Failed to find or create lyrics");
      throw new AppError("Failed to create track", 500, false, "LYRICS_CREATE_ERROR");
    }
  }

  async update({ result, trackId }: { result: LrclibResult; trackId: string }) {
    try {
      const existing = await prisma.lyrics.findUnique({ where: { trackId } });

      if (!existing) {
        throw new AppError("Lyrics do not exist", 400, true, "LYRICS_NOT_FOUND");
      }

      const attemptedAt = new Date();

      const createInput: Prisma.LyricsCreateInput = {
        attemptCount: existing.attemptCount + 1,
        lastAttemptAt: attemptedAt,
        track: { connect: { id: trackId } },
      };

      await this.parseResult(result, createInput, attemptedAt);

      try {
        const lyrics = await prisma.lyrics.update({ data: createInput, where: { trackId } });

        logger.info({ lyricsId: lyrics.id, trackId }, "Lyrics created successfully");

        return lyrics;
      } catch (error) {
        if (isPrismaKnownError(error) && error.code === "P2002") {
          const lyrics = await prisma.lyrics.findUniqueOrThrow({ where: { trackId } });

          logger.info({ lyricsId: lyrics.id }, "Lyrics already exists");

          return lyrics;
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, result }, "Failed to find or create lyrics");
      throw new AppError("Failed to create track", 500, false, "LYRICS_CREATE_ERROR");
    }
  }
}

export const lyricsService = new LyricsService();
