import { redirect } from "next/navigation";
import { clearSession } from "@/lib/context";

export async function GET() {
  await clearSession();
  redirect(`/login?error=${encodeURIComponent("Session expired. Please sign in again.")}`);
}
