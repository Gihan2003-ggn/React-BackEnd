 import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config(); // routes import karanna kalin env load wenna ona

import authRoutes from "./routes/auth.routes";
import favoriteRoutes from "./routes/favorite.routes";
import songRoutes from "./routes/song.routes";
import { errorHandler, notFound } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Sonora API is running" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/songs", songRoutes);
app.use("/api/v1/favorites", favoriteRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sonora API running on http://localhost:${PORT}`);
  console.log(`YouTube full songs : ${process.env.YOUTUBE_API_KEY ? "ON" : "OFF (add YOUTUBE_API_KEY to .env)"}`);
  console.log(`Jamendo full songs : ${process.env.JAMENDO_CLIENT_ID ? "ON" : "OFF (optional, add JAMENDO_CLIENT_ID)"}`);
  console.log("iTunes previews    : ON (30 second previews)");
});
