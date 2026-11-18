import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/http";
import { verifyToken } from "../utils/security";
import { readDb } from "../utils/db";

// Valid token ekak nathnam 401 yawanawa. User id eka res.locals.userId ekata damanawa.
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = token ? verifyToken(token) : null;
  if (!userId || !readDb().users.some((u) => u.id === userId)) {
    next(new HttpError(401, "Please sign in again"));
    return;
  }
  res.locals.userId = userId;
  next();
}
