import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  prisma: {
    track: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { NODE_ENV: "test" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@repo/db";

import { AppError } from "@/middleware/error-handler";

import { TrackService } from "./track.service";

const trackService = new TrackService();

const mockTrack = {
  albumCover: "https://example.com/cover.jpg",
  albumId: "album-1",
  albumName: "Test Album",
  artistId: "artist-1",
  artistName: "Test Artist",
  contexts: [],
  createdAt: new Date("2024-01-01"),
  duration: 180,
  explicitLyrics: false,
  feedback: [],
  id: "track-1",
  isrc: "USRC17607839",
  lyrics: null,
  shortTitle: "Test",
  title: "Test Track",
  translations: [],
  updatedAt: new Date("2024-01-01"),
};

const createInput = {
  albumCover: mockTrack.albumCover,
  albumId: mockTrack.albumId,
  albumName: mockTrack.albumName,
  artistId: mockTrack.artistId,
  artistName: mockTrack.artistName,
  duration: mockTrack.duration,
  explicitLyrics: mockTrack.explicitLyrics,
  id: mockTrack.id,
  isrc: mockTrack.isrc,
  shortTitle: mockTrack.shortTitle,
  title: mockTrack.title,
};

describe("TrackService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findById", () => {
    it("should return track when found", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(mockTrack as never);

      const result = await trackService.findById("track-1");

      expect(result).toEqual(mockTrack);
      expect(prisma.track.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "track-1" } }),
      );
    });

    it("should return null when track not found", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);

      const result = await trackService.findById("missing");

      expect(result).toBeNull();
    });

    it("should throw AppError 500 on database error", async () => {
      vi.mocked(prisma.track.findUnique).mockRejectedValue(new Error("DB connection lost"));

      await expect(trackService.findById("track-1")).rejects.toThrow(AppError);
      await expect(trackService.findById("track-1")).rejects.toMatchObject({
        code: "TRACK_FETCH_ERROR",
        statusCode: 500,
      });
    });
  });

  describe("create", () => {
    it("should create and return track when none exists", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.track.create).mockResolvedValue(mockTrack as never);

      const result = await trackService.create(createInput);

      expect(result).toEqual(mockTrack);
      expect(prisma.track.findUnique).toHaveBeenCalledWith({ where: { id: createInput.id } });
      expect(prisma.track.create).toHaveBeenCalledWith({ data: createInput });
    });

    it("should throw AppError 400 TRACK_ALREADY_EXISTS when track is found before create", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(mockTrack as never);

      await expect(trackService.create(createInput)).rejects.toThrow(AppError);
      await expect(trackService.create(createInput)).rejects.toMatchObject({
        code: "TRACK_ALREADY_EXISTS",
        statusCode: 400,
      });
      expect(prisma.track.create).not.toHaveBeenCalled();
    });

    it("should return existing track when create races with P2002 unique violation", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.track.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.track.findUniqueOrThrow).mockResolvedValue(mockTrack as never);

      const result = await trackService.create(createInput);

      expect(result).toEqual(mockTrack);
      expect(prisma.track.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: createInput.id },
      });
    });

    it("should throw AppError 500 TRACK_CREATE_ERROR on generic create failure", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.track.create).mockRejectedValue(new Error("Connection refused"));

      await expect(trackService.create(createInput)).rejects.toMatchObject({
        code: "TRACK_CREATE_ERROR",
        statusCode: 500,
      });
    });

    it("should throw AppError 500 TRACK_CREATE_ERROR when initial findUnique fails", async () => {
      vi.mocked(prisma.track.findUnique).mockRejectedValue(new Error("DB error"));

      await expect(trackService.create(createInput)).rejects.toMatchObject({
        code: "TRACK_CREATE_ERROR",
        statusCode: 500,
      });
      expect(prisma.track.create).not.toHaveBeenCalled();
    });

    it("should throw AppError 500 TRACK_CREATE_ERROR when P2002 recovery fetch fails", async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.track.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.track.findUniqueOrThrow).mockRejectedValue(new Error("Record disappeared"));

      await expect(trackService.create(createInput)).rejects.toMatchObject({
        code: "TRACK_CREATE_ERROR",
        statusCode: 500,
      });
    });
  });
});
