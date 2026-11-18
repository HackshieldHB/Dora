import { NextRequest, NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { loadDashboard } from "@/server/dashboard";
import { formatIdr } from "@/lib/format";

export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx?.permissions.has("overview.view")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const data = await loadDashboard(ctx, {
    month: params.get("month") || "",
    branchId: params.get("branchId") || "",
    departmentId: params.get("departmentId") || "",
    locationId: params.get("locationId") || "",
    periodId: params.get("periodId") || "",
    payrollStatus: params.get("payrollStatus") || "",
  });
  return NextResponse.json({
    cards: data.cards.map((card) => ({
      ...card,
      value: /^\d+$/.test(card.value) && card.title.toLowerCase().includes("net") ? formatIdr(Number(card.value)) : card.value,
    })),
    board: data.board,
  });
}
