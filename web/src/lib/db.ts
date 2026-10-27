import postgres from "postgres";

// One client per server instance. On Vercel, DATABASE_URL comes from the
// Neon (Postgres) integration; locally, put it in web/.env.local.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export function getSql(): postgres.Sql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See web/README.md.");
  }
  globalForDb.sql ??= postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false, // required for poolers such as Neon's pgbouncer
    idle_timeout: 20,
  });
  return globalForDb.sql;
}
