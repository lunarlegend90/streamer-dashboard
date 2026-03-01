import { createClient } from "@supabase/supabase-js";

const REMEMBER_KEY = "nexus_remember_me";

/**
 * A storage adapter that:
 * - Reads from sessionStorage first (session-only login)
 * - Falls back to localStorage (remember me)
 * - Writes to sessionStorage when rememberMe = false
 * - Writes to localStorage when rememberMe = true
 */
const storage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;

    try {
      const ss = window.sessionStorage.getItem(key);
      if (ss) return ss;
    } catch {}

    try {
      return window.localStorage.getItem(key);
    } catch {}

    return null;
  },

  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;

    let remember = true;
    try {
      const v = window.localStorage.getItem(REMEMBER_KEY);
      if (v === "0") remember = false;
      if (v === "1") remember = true;
    } catch {}

    // If remember=false → store in sessionStorage only
    if (!remember) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {}
      try {
        window.localStorage.removeItem(key);
      } catch {}
      return;
    }

    // remember=true → store in localStorage
    try {
      window.localStorage.setItem(key, value);
    } catch {}
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  },

  removeItem: (key: string) => {
    if (typeof window === "undefined") return;

    try {
      window.sessionStorage.removeItem(key);
    } catch {}
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      storage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);