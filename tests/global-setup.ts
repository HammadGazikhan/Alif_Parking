import { execSync } from "node:child_process";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-env";

/** Create the test database if needed and apply all migrations. */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
}
