import { redirect } from "next/navigation";
import { logout } from "@/server/auth";

export async function POST() {
  await logout();
  redirect("/login");
}
