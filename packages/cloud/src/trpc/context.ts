import type { Env, User } from "../types";
import { verifyToken } from "../services/auth/client";
import { getDb } from "../lib/db";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";

export interface Context {
  req: Request;
  env: Env;
  user: User | null;
  db: ReturnType<typeof getDb>;
}

export async function createContext(req: Request, env: Env): Promise<Context> {
  const db = getDb(env.DB);
  let user: User | null = null;

  // Extract and verify JWT from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Dev bypass token (development only)
    if (env.DEV_BYPASS_TOKEN && token === env.DEV_BYPASS_TOKEN) {
      user = {
        id: "dev-user",
        email: "dev@hands.app",
        name: "Dev User",
        avatarUrl: null,
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      try {
        const payload = await verifyToken(token, env.AUTH_SECRET);
        if (payload?.sub) {
          // Fetch user from database
          const result = await db
            .select()
            .from(users)
            .where(eq(users.id, payload.sub))
            .limit(1)
            .then((rows) => rows[0]);

          if (result) {
            user = {
              id: result.id,
              email: result.email,
              name: result.name,
              avatarUrl: result.avatarUrl,
              stripeCustomerId: result.stripeCustomerId,
              createdAt: result.createdAt,
              updatedAt: result.updatedAt,
            };
          }
        }
      } catch {
        // Invalid token, user remains null
      }
    }
  }

  return { req, env, user, db };
}
