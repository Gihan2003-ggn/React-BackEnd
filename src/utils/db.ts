import fs from "fs";
import path from "path";
import type { Song } from "../services/music.service";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  favorites: Song[];
}

interface Db {
  users: User[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export function readDb(): Db {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Db;
  } catch {
    return { users: [] };
  }
}

export function writeDb(db: Db): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
