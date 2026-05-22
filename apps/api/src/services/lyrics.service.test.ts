import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  prisma: {
    lyrics: {
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

import type { GetLyricsResponse as LrclibResponse } from "./lrclib.service";
import { LyricsService } from "./lyrics.service";

const lyricsService = new LyricsService();

const trackId = "track-1";

const baseLrclibResponse: LrclibResponse = {
  albumName: "Test Album",
  artistName: "Test Artist",
  duration: 180,
  id: 12_345,
  instrumental: false,
  plainLyrics: "La la la",
  syncedLyrics: "[00:00.00] La la la",
  trackName: "Test Track",
};

const mockLyrics = {
  attemptCount: 1,
  contentHash: null,
  createdAt: new Date("2024-01-01"),
  errorMessage: null,
  fetchedAt: null,
  id: "lyrics-1",
  lastAttemptAt: new Date("2024-01-01"),
  plainLyrics: null,
  status: "AVAILABLE",
  syncedLyrics: null,
  trackId,
  updatedAt: new Date("2024-01-01"),
};

describe("LyricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findByTrackId", () => {
    it("should return lyrics when found", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(mockLyrics as never);

      const result = await lyricsService.findByTrackId(trackId);

      expect(result).toEqual(mockLyrics);
      expect(prisma.lyrics.findUnique).toHaveBeenCalledWith({ where: { trackId } });
    });

    it("should return null when lyrics not found", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);

      const result = await lyricsService.findByTrackId("missing");

      expect(result).toBeNull();
    });

    it("should throw AppError 500 LYRICS_FETCH_ERROR on database error", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockRejectedValue(new Error("DB connection lost"));

      await expect(lyricsService.findByTrackId(trackId)).rejects.toThrow(AppError);
      await expect(lyricsService.findByTrackId(trackId)).rejects.toMatchObject({
        code: "LYRICS_FETCH_ERROR",
        statusCode: 500,
      });
    });
  });

  describe("create", () => {
    it("should create AVAILABLE lyrics with plain and synced text and a content hash", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockResolvedValue(mockLyrics as never);

      await lyricsService.create({
        result: { data: baseLrclibResponse, kind: "found" },
        trackId,
      });

      const createCall = vi.mocked(prisma.lyrics.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        attemptCount: 1,
        errorMessage: null,
        plainLyrics: baseLrclibResponse.plainLyrics,
        status: "AVAILABLE",
        syncedLyrics: baseLrclibResponse.syncedLyrics,
        track: { connect: { id: trackId } },
      });
      expect(typeof createCall?.data.contentHash).toBe("string");
      expect(createCall?.data.contentHash).toHaveLength(64);
      expect(createCall?.data.lastAttemptAt).toBeInstanceOf(Date);
      expect(createCall?.data.fetchedAt).toBeInstanceOf(Date);
    });

    it("should hash plainLyrics when syncedLyrics is not available", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockResolvedValue(mockLyrics as never);

      const data: LrclibResponse = { ...baseLrclibResponse, syncedLyrics: null };

      await lyricsService.create({ result: { data, kind: "found" }, trackId });

      const createCall = vi.mocked(prisma.lyrics.create).mock.calls[0]?.[0];
      expect(createCall?.data.syncedLyrics).toBeNull();
      expect(createCall?.data.contentHash).toHaveLength(64);
    });

    it("should create INSTRUMENTAL lyrics without lyrics text or content hash", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockResolvedValue(mockLyrics as never);

      const data: LrclibResponse = { ...baseLrclibResponse, instrumental: true };

      await lyricsService.create({ result: { data, kind: "found" }, trackId });

      const createCall = vi.mocked(prisma.lyrics.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        errorMessage: null,
        status: "INSTRUMENTAL",
      });
      expect(createCall?.data.plainLyrics).toBeUndefined();
      expect(createCall?.data.syncedLyrics).toBeUndefined();
      expect(createCall?.data.contentHash).toBeUndefined();
      expect(createCall?.data.fetchedAt).toBeInstanceOf(Date);
    });

    it("should create NOT_FOUND lyrics with no fetchedAt", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockResolvedValue(mockLyrics as never);

      await lyricsService.create({ result: { kind: "not_found" }, trackId });

      const createCall = vi.mocked(prisma.lyrics.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        attemptCount: 1,
        status: "NOT_FOUND",
        track: { connect: { id: trackId } },
      });
      expect(createCall?.data.fetchedAt).toBeUndefined();
      expect(createCall?.data.errorMessage).toBeUndefined();
    });

    it("should create FETCH_FAILED lyrics with errorMessage", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockResolvedValue(mockLyrics as never);

      await lyricsService.create({
        result: { errorMessage: "upstream 502", kind: "failed" },
        trackId,
      });

      const createCall = vi.mocked(prisma.lyrics.create).mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        errorMessage: "upstream 502",
        status: "FETCH_FAILED",
      });
      expect(createCall?.data.fetchedAt).toBeUndefined();
    });

    it("should throw AppError 400 LYRICS_ALREADY_EXIST when lyrics are found before create", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(mockLyrics as never);

      await expect(
        lyricsService.create({ result: { kind: "not_found" }, trackId }),
      ).rejects.toThrow(AppError);
      await expect(
        lyricsService.create({ result: { kind: "not_found" }, trackId }),
      ).rejects.toMatchObject({
        code: "LYRICS_ALREADY_EXIST",
        statusCode: 400,
      });
      expect(prisma.lyrics.create).not.toHaveBeenCalled();
    });

    it("should return existing lyrics when create races with P2002 unique violation", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.lyrics.findUniqueOrThrow).mockResolvedValue(mockLyrics as never);

      const result = await lyricsService.create({
        result: { kind: "not_found" },
        trackId,
      });

      expect(result).toEqual(mockLyrics);
      expect(prisma.lyrics.findUniqueOrThrow).toHaveBeenCalledWith({ where: { trackId } });
    });

    it("should throw AppError 500 LYRICS_CREATE_ERROR on generic create failure", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockRejectedValue(new Error("Connection refused"));

      await expect(
        lyricsService.create({ result: { kind: "not_found" }, trackId }),
      ).rejects.toMatchObject({
        code: "LYRICS_CREATE_ERROR",
        statusCode: 500,
      });
    });

    it("should throw AppError 500 LYRICS_CREATE_ERROR when initial findUnique fails", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockRejectedValue(new Error("DB error"));

      await expect(
        lyricsService.create({ result: { kind: "not_found" }, trackId }),
      ).rejects.toMatchObject({
        code: "LYRICS_CREATE_ERROR",
        statusCode: 500,
      });
      expect(prisma.lyrics.create).not.toHaveBeenCalled();
    });

    it("should throw AppError 500 LYRICS_CREATE_ERROR when P2002 recovery fetch fails", async () => {
      vi.mocked(prisma.lyrics.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.lyrics.create).mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          clientVersion: "7.0.0",
          code: "P2002",
        }),
      );
      vi.mocked(prisma.lyrics.findUniqueOrThrow).mockRejectedValue(new Error("Record disappeared"));

      await expect(
        lyricsService.create({ result: { kind: "not_found" }, trackId }),
      ).rejects.toMatchObject({
        code: "LYRICS_CREATE_ERROR",
        statusCode: 500,
      });
    });
  });
});
