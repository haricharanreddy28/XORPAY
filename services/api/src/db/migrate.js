import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { connectDatabase, closeDatabase } from "./database.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

async function migrate() {
  const pool = await connectDatabase();
  if (!pool) throw new Error("DATABASE_URL is required to run migrations");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('xorpay:db:migrations'))");
    await client.query("CREATE TABLE IF NOT EXISTS xorpay_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const applied = await client.query("SELECT version FROM xorpay_schema_migrations");
    const done = new Set(applied.rows.map((row) => row.version));
    const files = (await readdir(migrationsDir)).filter((name) => /^[0-9]+_[a-z0-9_]+\.sql$/.test(name)).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO xorpay_schema_migrations(version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.info("[migrate] applied " + file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.info("[migrate] database schema is current");
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('xorpay:db:migrations'))"); } catch {}
    client.release();
    await closeDatabase();
  }
}

migrate().catch((error) => {
  console.error("[migrate] failed", error?.code || error?.message || "unknown");
  process.exitCode = 1;
});
