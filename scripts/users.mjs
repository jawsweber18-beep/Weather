#!/usr/bin/env node
/**
 * Manage Quorum accounts (sign-up is disabled in the app).
 *
 *   npm run users -- add <email> <password> [name]
 *   npm run users -- passwd <email> <new-password>
 *   npm run users -- remove <email>
 *   npm run users -- list
 *
 * Uses DATABASE_URL when set, otherwise the PGLite directory in
 * PGLITE_DATA_DIR. PGLite allows one process at a time: stop the app first.
 */
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { pendingMigrations } from "./migration-plan.mjs";

const [command, ...args] = process.argv.slice(2);
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage:\n  npm run users -- add <email> <password> [name]\n  npm run users -- passwd <email> <new-password>\n  npm run users -- remove <email>\n  npm run users -- list",
  );
  process.exit(1);
}

async function openDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url });
    return {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      exec: (text) => pool.query(text),
      close: () => pool.end(),
    };
  }
  const dataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (!dataDir) {
    usage("Set DATABASE_URL or PGLITE_DATA_DIR so the accounts are saved somewhere.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    query: async (text, params = []) => (await db.query(text, params)).rows,
    exec: (text) => db.exec(text),
    close: () => db.close(),
  };
}

async function migrate(db) {
  await db.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql"));
  const done = (await db.query("select name from _migrations")).map((r) => r.name);
  for (const { name } of pendingMigrations(
    files.map((f) => `/migrations/${f}`),
    done,
  )) {
    await db.exec(await readFile(join(migrationsDir, name), "utf8"));
    await db.query("insert into _migrations (name) values ($1)", [name]);
  }
}

const normalize = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

async function main() {
  if (!command) usage();
  const db = await openDb();
  try {
    await migrate(db);
    if (command === "list") {
      const rows = await db.query(
        'select email, name, "createdAt" from "user" order by "createdAt"',
      );
      if (!rows.length) console.log("No accounts yet.");
      for (const r of rows) console.log(`${r.email}\t${r.name}`);
    } else if (command === "add") {
      const [rawEmail, password, ...nameParts] = args;
      const email = normalize(rawEmail);
      if (!email.includes("@") || !password) usage("add needs an email and a password.");
      if (password.length < 8) usage("Passwords need at least 8 characters.");
      const existing = await db.query('select id from "user" where email = $1', [email]);
      if (existing.length) usage(`${email} already has an account (use passwd to change it).`);
      const id = randomUUID();
      const name = nameParts.join(" ") || email.split("@")[0];
      const now = new Date();
      await db.query(
        'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, $4, $4)',
        [id, name, email, now],
      );
      await db.query(
        'insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, \'credential\', $2, $3, $4, $4)',
        [randomUUID(), id, await hashPassword(password), now],
      );
      console.log(`Added ${email}.`);
    } else if (command === "passwd") {
      const [rawEmail, password] = args;
      const email = normalize(rawEmail);
      if (!password || password.length < 8)
        usage("passwd needs an email and a new password (8+ characters).");
      const users = await db.query('select id from "user" where email = $1', [email]);
      if (!users.length) usage(`No account for ${email}.`);
      await db.query(
        'update "account" set password = $1, "updatedAt" = now() where "userId" = $2 and "providerId" = \'credential\'',
        [await hashPassword(password), users[0].id],
      );
      await db.query('delete from "session" where "userId" = $1', [users[0].id]);
      console.log(`Password changed for ${email}; existing sessions signed out.`);
    } else if (command === "remove") {
      const email = normalize(args[0]);
      const users = await db.query('delete from "user" where email = $1 returning id', [email]);
      console.log(users.length ? `Removed ${email}.` : `No account for ${email}.`);
    } else {
      usage(`Unknown command: ${command}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
