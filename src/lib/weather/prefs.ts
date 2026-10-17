import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/**
 * Account-backed settings. localStorage stays the working copy (instant boot,
 * read synchronously by the theme script); the account copy is pulled once
 * after sign-in and pushed after every change.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Prefs = {
  place: Json;
  recent: Json;
  units: Json;
  theme: Json;
  hidden: Json;
};

const KEYS: Record<keyof Prefs, string> = {
  place: "quorum.place",
  recent: "quorum.recent",
  units: "quorum.units",
  theme: "quorum.theme",
  hidden: "quorum.hidden",
};

const MAX_BYTES = 16_000;

function parsePrefs(input: unknown): Prefs {
  const rec = input && typeof input === "object" ? (input as Partial<Prefs>) : {};
  const prefs: Prefs = {
    place: rec.place ?? null,
    recent: rec.recent ?? null,
    units: rec.units ?? null,
    theme: rec.theme ?? null,
    hidden: rec.hidden ?? null,
  };
  if (JSON.stringify(prefs).length > MAX_BYTES) throw new Error("Settings too large");
  return prefs;
}

export const fetchPrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Prefs | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ prefs: unknown }>`
      select prefs from user_prefs where user_id = ${context.userId}`;
    return rows[0] ? parsePrefs(rows[0].prefs) : null;
  });

export const storePrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Prefs) => parsePrefs(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into user_prefs (user_id, prefs, updated_at)
      values (${context.userId}, ${JSON.stringify(data)}::jsonb, now())
      on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now()`;
    return { ok: true };
  });

function readLocal(): Prefs {
  const out = {} as Prefs;
  for (const [field, key] of Object.entries(KEYS) as [keyof Prefs, string][]) {
    let value: Json = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) value = field === "units" || field === "theme" ? raw : JSON.parse(raw);
    } catch {
      value = null;
    }
    out[field] = value;
  }
  return out;
}

function writeLocal(prefs: Prefs) {
  for (const [field, key] of Object.entries(KEYS) as [keyof Prefs, string][]) {
    const value = prefs[field];
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }
}

/** Drop this device's copy (on sign-out, so the next account starts clean). */
export function clearLocalPrefs() {
  writeLocal({ place: null, recent: null, units: null, theme: null, hidden: null });
}

/**
 * After sign-in: adopt the account's settings, or seed the account from this
 * device when it has none yet.
 */
export async function syncPrefsFromAccount(): Promise<void> {
  const remote: Prefs | null = await fetchPrefs();
  if (remote) writeLocal(remote);
  else await storePrefs({ data: readLocal() });
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** Save this device's settings to the account (debounced). */
export function pushPrefs() {
  if (typeof window === "undefined") return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    storePrefs({ data: readLocal() }).catch(() => {
      /* offline or signed out — the next change retries */
    });
  }, 600);
}
