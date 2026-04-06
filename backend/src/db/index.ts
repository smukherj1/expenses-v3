import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function poolConfig() {
  const c = {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "expenses",
    user: process.env.PGUSER ?? "expenses",
    password: process.env.PGPASSWORD ?? "expenses",
  };
  console.log(
    "Connecting to Postgres DB at " +
      `host=${c.host} port=${c.port} ` +
      `database=${c.database} user=${c.user} ` +
      `password=${c.password ? "*".repeat(c.password.length) : "(empty)"}`,
  );
  return c;
}

const pool = new Pool(poolConfig());

export const db = drizzle(pool);
export type DB = typeof db;
