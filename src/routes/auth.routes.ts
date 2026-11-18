import crypto from "crypto";
import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { readDb, writeDb, User } from "../utils/db";
import { asyncHandler, HttpError } from "../utils/http";
import { createToken, hashPassword, verifyPassword } from "../utils/security";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email });

router.post(
  "/register",
  asyncHandler((req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (name.length < 2 || name.length > 50) {
      throw new HttpError(400, "Name must be between 2 and 50 characters");
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      throw new HttpError(400, "Enter a valid email address");
    }
    if (password.length < 8 || password.length > 100) {
      throw new HttpError(400, "Password must be 8-100 characters");
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new HttpError(400, "Password must contain at least one letter and one number");
    }

    const db = readDb();
    if (db.users.some((u) => u.email === email)) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const user: User = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      favorites: [],
    };
    db.users.push(user);
    writeDb(db);

    res.status(201).json({ success: true, data: { token: createToken(user.id), user: publicUser(user) } });
  })
);

router.post(
  "/login",
  asyncHandler((req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    const user = readDb().users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "Incorrect email or password");
    }
    res.json({ success: true, data: { token: createToken(user.id), user: publicUser(user) } });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler((_req, res) => {
    const user = readDb().users.find((u) => u.id === res.locals.userId);
    if (!user) throw new HttpError(401, "Please sign in again");
    res.json({ success: true, data: publicUser(user) });
  })
);

export default router;
