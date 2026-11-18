import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/context";

export function flash(path: string, kind: "ok" | "error", message: string): never {
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set(kind, message);
  redirect(`${base}?${params.toString()}`);
}

export async function act(path: string, work: () => Promise<string | void>) {
  try {
    const message = await work();
    flash(path, "ok", message || "Saved.");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    flash(path, "error", error instanceof Error ? error.message : "The request failed.");
  }
}
