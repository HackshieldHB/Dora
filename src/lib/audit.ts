import { prisma } from "./db";
import type { Ctx } from "./context";

export async function audit(ctx: Pick<Ctx, "companyId" | "userId">, action: string, entity: string, entityId = "", detail = "") {
  await prisma.auditLog.create({
    data: { companyId: ctx.companyId, actorId: ctx.userId, action, entity, entityId, detail: detail.slice(0, 2000) },
  });
}
