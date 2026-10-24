import pg from "pg";

const { Pool } = pg;
let pool = null;

export function databaseConfigured(env = process.env) {
  return Boolean(env.DATABASE_URL);
}

export async function connectDatabase(env = process.env) {
  if (!databaseConfigured(env)) {
    if (env.NODE_ENV === "production" || String(env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION") {
      throw new Error("DATABASE_URL is required in production");
    }
    return null;
  }
  if (pool) return pool;

  const production = env.NODE_ENV === "production" || String(env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";
  const useTls = production || env.DATABASE_SSL === "true";
  if (production && env.DATABASE_SSL === "false") {
    throw new Error("Database TLS cannot be disabled in production");
  }
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: Number(env.DATABASE_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: useTls ? { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) } : undefined,
    application_name: "xorpay-api",
  });
  pool.on("error", (error) => {
    console.error("[database] idle connection error", error?.code || "unknown");
  });
  await pool.query("SELECT 1");
  return pool;
}

export function getDatabase() {
  if (!pool) throw new Error("Database is not connected");
  return pool;
}

export async function closeDatabase() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
