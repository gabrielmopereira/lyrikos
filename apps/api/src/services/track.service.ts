import { prisma } from "@repo/db";
import type { Prisma } from "@repo/db";

import { logger } from "@/lib/logger";
import { AppError, isPrismaKnownError } from "@/middleware/error-handler";

export class TrackService {
  async findById(id: string) {
    try {
      const track = await prisma.track.findUnique({
        select: {
          albumCover: true,
          albumId: true,
          albumName: true,
          artistId: true,
          artistName: true,
          createdAt: true,
          duration: true,
          explicitLyrics: true,
          id: true,
          isrc: true,
          lyrics: true,
          shortTitle: true,
          title: true,
          updatedAt: true,
        },
        where: { id },
      });

      return track;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ error, trackId: id }, "Failed to find track by ID");
      throw new AppError("Failed to fetch track", 500, false, "TRACK_FETCH_ERROR");
    }
  }

  async create(data: Prisma.TrackCreateInput) {
    try {
      const existing = await prisma.track.findUnique({ where: { id: data.id } });

      if (existing) {
        throw new AppError("Track already exists", 400, true, "TRACK_ALREADY_EXISTS");
      }

      try {
        const track = await prisma.track.create({ data });

        logger.info({ trackId: track.id }, "Track created successfully");

        return track;
      } catch (error) {
        if (isPrismaKnownError(error) && error.code === "P2002") {
          const track = await prisma.track.findUniqueOrThrow({ where: { id: data.id } });

          logger.info({ trackId: track.id }, "Track already exists");

          return track;
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ data, error }, "Failed to find or create track");
      throw new AppError("Failed to create track", 500, false, "TRACK_CREATE_ERROR");
    }
  }
}

export const trackService = new TrackService();
