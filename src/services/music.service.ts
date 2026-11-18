// Normalized song shape - the frontend uses this for every source
export interface Song {
  id: string;
  source: "youtube" | "jamendo" | "itunes";
  title: string;
  artist: string;
  album: string;
  genre: string;
  coverUrl: string;
  audioUrl: string; // direct audio file (jamendo / itunes). Empty for youtube.
  videoId?: string; // youtube only
  duration: number; // seconds
  isFull: boolean; // true = full song, false = 30s preview
}

const TIMEOUT_MS = 8000;

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = ` - ${body.error.message}`;
    } catch {
      /* ignore */
    }
    // Never print the full URL (it contains API keys)
    throw new Error(`${url.hostname} responded ${response.status}${detail}`);
  }
  return (await response.json()) as T;
}

// ======================= YouTube: FULL songs (any popular song) =======================
// Needs a free API key: https://console.cloud.google.com -> enable "YouTube Data API v3"
// The frontend plays these through YouTube's official embedded player.
interface YoutubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
}

const ytCache = new Map<string, { at: number; data: Song[] }>();
const YT_CACHE_MS = 10 * 60 * 1000; // searches cost API quota, so cache for 10 minutes

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
}

function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

async function fromYoutube(query: string, limit: number): Promise<Song[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const cacheKey = `${query.toLowerCase()}|${limit}`;
  const hit = ytCache.get(cacheKey);
  if (hit && Date.now() - hit.at < YT_CACHE_MS) return hit.data;

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10"); // Music
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("maxResults", String(limit));
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", key);

  const search = await getJson<{ items?: YoutubeSearchItem[] }>(searchUrl);
  const items = (search.items ?? []).filter((i) => i.id.videoId);
  if (!items.length) return [];

  // Second (cheap) call to get durations. If it fails we just show 0:00.
  const durations = new Map<string, number>();
  try {
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "contentDetails");
    videosUrl.searchParams.set("id", items.map((i) => i.id.videoId as string).join(","));
    videosUrl.searchParams.set("key", key);
    const videos = await getJson<{ items?: { id: string; contentDetails: { duration: string } }[] }>(videosUrl);
    for (const v of videos.items ?? []) durations.set(v.id, parseIsoDuration(v.contentDetails.duration));
  } catch (error) {
    console.error("YouTube durations error:", (error as Error).message);
  }

  const songs: Song[] = items.map((item) => {
    const videoId = item.id.videoId as string;
    const thumbs = item.snippet.thumbnails;
    return {
      id: `youtube-${videoId}`,
      source: "youtube" as const,
      title: decodeEntities(item.snippet.title),
      artist: decodeEntities(item.snippet.channelTitle).replace(/ - Topic$/, ""),
      album: "",
      genre: "",
      coverUrl: thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? "",
      audioUrl: "",
      videoId,
      duration: durations.get(videoId) ?? 0,
      isFull: true,
    };
  });

  ytCache.set(cacheKey, { at: Date.now(), data: songs });
  return songs;
}

// ======================= Jamendo: FULL songs (free / independent music) =======================
// Free Client ID: https://devportal.jamendo.com
interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  album_name?: string;
  image?: string;
  audio?: string;
  musicinfo?: { tags?: { genres?: string[] } };
}

async function fromJamendo(query: string | null, limit: number): Promise<Song[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return [];

  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("imagesize", "600");
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("include", "musicinfo");
  if (query) url.searchParams.set("search", query);
  else url.searchParams.set("order", "popularity_week");

  const data = await getJson<{ results?: JamendoTrack[] }>(url);
  return (data.results ?? [])
    .filter((t) => t.audio)
    .map((t) => ({
      id: `jamendo-${t.id}`,
      source: "jamendo" as const,
      title: t.name,
      artist: t.artist_name,
      album: t.album_name ?? "",
      genre: (t.musicinfo?.tags?.genres?.[0] ?? "").toLowerCase(),
      coverUrl: t.image ?? "",
      audioUrl: t.audio as string,
      duration: t.duration ?? 0,
      isFull: true,
    }));
}

// ======================= iTunes: popular songs, 30s previews only =======================
interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
}

async function fromItunes(query: string, limit: number): Promise<Song[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(limit));

  const data = await getJson<{ results?: ItunesTrack[] }>(url);
  return (data.results ?? [])
    .filter((t) => t.previewUrl)
    .map((t) => ({
      id: `itunes-${t.trackId}`,
      source: "itunes" as const,
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName ?? "",
      genre: (t.primaryGenreName ?? "").toLowerCase(),
      coverUrl: (t.artworkUrl100 ?? "").replace("100x100", "600x600"),
      audioUrl: t.previewUrl as string,
      duration: Math.round((t.trackTimeMillis ?? 0) / 1000),
      isFull: false,
    }));
}

// Full songs first (YouTube, Jamendo), then iTunes previews
async function combine(sources: Promise<Song[]>[]): Promise<Song[]> {
  const settled = await Promise.allSettled(sources);
  if (settled.every((s) => s.status === "rejected")) {
    throw new Error("Unable to fetch songs right now");
  }
  const songs: Song[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") songs.push(...result.value);
    else console.error("Music source error:", (result.reason as Error)?.message);
  }
  return songs;
}

export function searchSongs(query: string): Promise<Song[]> {
  return combine([fromYoutube(query, 15), fromJamendo(query, 15), fromItunes(query, 15)]);
}

export function trendingSongs(): Promise<Song[]> {
  const homeQuery = process.env.HOME_QUERY || "top hits";
  return combine([fromYoutube(homeQuery, 12), fromJamendo(null, 8), fromItunes(homeQuery, 10)]);
}
