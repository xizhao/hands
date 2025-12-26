import { useState, useEffect } from "react";
import type { CollabUser } from "../types";
import {
  ADJECTIVES,
  ANIMALS,
  CURSOR_COLORS,
  USER_STORAGE_KEY,
} from "../constants";

function generateUser(): CollabUser {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

  return {
    id: crypto.randomUUID(),
    name: `${adj} ${animal}`,
    color,
  };
}

/**
 * Get or create anonymous user identity from localStorage.
 * Returns null during SSR/initial render.
 */
export function useUserIdentity(): CollabUser | null {
  const [user, setUser] = useState<CollabUser | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        const newUser = generateUser();
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
        setUser(newUser);
      }
    } catch {
      // localStorage unavailable, generate ephemeral user
      setUser(generateUser());
    }
  }, []);

  return user;
}
