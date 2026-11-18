import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import type { Song } from "../services/music.service";
import { readDb, writeDb } from "../utils/db";
import { asyncHandler, HttpError } from "../utils/http";

const router = Router();
router.use(authenticate);

// Only keep the fields we need from the request body (sanitize)
function cleanSong(input: any): Song {
  const str = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
  const source = input?.source === "youtube" || input?.source === "jamendo" ? input.source : "itunes";
  const audioUrl = str(input?.audioUrl, 1000);
  const videoId = str(input?.videoId, 20);

  const validAudio = /^https?:\/\//.test(audioUrl);
  const validVideo = source === "youtube" && /^[\w-]{11}$/.test(videoId);
  if (!input?.id || !input?.title || !(validAudio || validVideo)) {
    throw new HttpError(400, "Invalid song");
  }
  return {
    id: str(input.id, 100),
    source,
    title: str(input.title),
    artist: str(input.artist),
    album: str(input.album),
    genre: str(input.genre, 60),
    coverUrl: str(input.coverUrl, 1000),
    audioUrl: source === "youtube" ? "" : audioUrl,
    ...(source === "youtube" ? { videoId } : {}),
    duration: Number(input.duration) || 0,
    isFull: Boolean(input.isFull),
  };
}

router.get(
  "/",
  asyncHandler((_req, res) => {
    const user = readDb().users.find((u) => u.id === res.locals.userId);
    res.json({ success: true, data: user?.favorites ?? [] });
  })
);

router.post(
  "/",
  asyncHandler((req, res) => {
    const song = cleanSong(req.body);
    const db = readDb();
    const user = db.users.find((u) => u.id === res.locals.userId);
    if (!user) throw new HttpError(401, "Please sign in again");

    if (!user.favorites.some((s) => s.id === song.id)) {
      user.favorites.unshift(song); // newest first
      writeDb(db);
    }
    res.status(201).json({ success: true, data: user.favorites });
  })
);

router.delete(
  "/:songId",
  asyncHandler((req, res) => {
    const db = readDb();
    const user = db.users.find((u) => u.id === res.locals.userId);
    if (!user) throw new HttpError(401, "Please sign in again");

    user.favorites = user.favorites.filter((s) => s.id !== req.params.songId);
    writeDb(db);
    res.json({ success: true, data: user.favorites });
  })
);

export default router;
