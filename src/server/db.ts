import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

type DbClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: DbClient; prismaFingerprint?: string };

/** Changes when `prisma generate` adds fields, so a hot reload does not keep the previous client. */
const modelFingerprint = Object.keys(Prisma.UserScalarFieldEnum).sort().join(",");

export const prisma: DbClient =
  globalForPrisma.prisma && globalForPrisma.prismaFingerprint === modelFingerprint ? globalForPrisma.prisma : createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaFingerprint = modelFingerprint;
}

/** Either the root client or an interactive transaction client. */
export type Db = Omit<DbClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
