import { Router } from "express";
import { searchSongs, trendingSongs } from "../services/music.service";
import { asyncHandler, HttpError } from "../utils/http";

const router = Router();

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    if (typeof q !== "string" || !q.trim()) {
      throw new HttpError(400, "Please enter a song or artist name");
    }
    if (q.trim().length > 100) {
      throw new HttpError(400, "Search text is too long (max 100 characters)");
    }
    const songs = await searchSongs(q.trim());
    res.json({ success: true, count: songs.length, data: songs });
  })
);

router.get(
  "/trending",
  asyncHandler(async (_req, res) => {
    const songs = await trendingSongs();
    res.json({ success: true, count: songs.length, data: songs });
  })
);

export default router;
