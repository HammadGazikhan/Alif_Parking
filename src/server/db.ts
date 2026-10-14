import "server-only";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Neon closes idle pooler sockets. Release them first so the next query opens a live connection.
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
  });
  pool.on("error", (err) => {
    console.error("[db] idle postgres client error", err);
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

type DbClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: DbClient; prismaFingerprint?: string };

/** Changes when `prisma generate` adds fields, so a hot reload does not keep the previous client. */
const modelFingerprint = `pool-v2:${Object.keys(Prisma.UserScalarFieldEnum).sort().join(",")}`;

export const prisma: DbClient =
  globalForPrisma.prisma && globalForPrisma.prismaFingerprint === modelFingerprint ? globalForPrisma.prisma : createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaFingerprint = modelFingerprint;
}

/** Either the root client or an interactive transaction client. */
export type Db = Omit<DbClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
