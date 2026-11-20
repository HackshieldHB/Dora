import { PrismaClient } from "@prisma/client";
import { decryptResult, encryptArgs } from "./field-crypto";

function createClient() {
  return new PrismaClient().$extends({
    name: "dora-field-encryption",
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          // Query extensions only see the top-level operation; nested writes and included
          // relations live inside `args` / the result, which the helpers walk recursively.
          const result = await query(encryptArgs(operation, args) as typeof args);
          return decryptResult(result);
        },
      },
    },
  });
}

export type DbClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: DbClient };

export const prisma: DbClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
