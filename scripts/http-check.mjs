const base = "http://localhost:3010";

function cookiesFrom(response, jar) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function login(email) {
  const jar = new Map();
  const page = await fetch(`${base}/login`);
  cookiesFrom(page, jar);
  const html = await page.text();
  const match = html.match(/name="(\$ACTION_ID_[^"]+)"/);
  if (!match) throw new Error("Login action id missing");
  const body = new FormData();
  body.set(match[1], "");
  body.set("email", email);
  body.set("password", "Dora#2026");
  const posted = await fetch(`${base}/login`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) },
  });
  cookiesFrom(posted, jar);
  return { jar, status: posted.status, location: posted.headers.get("location") };
}

async function get(path, jar) {
  const response = await fetch(`${base}${path}`, { headers: { cookie: cookieHeader(jar) }, redirect: "manual" });
  const text = await response.text();
  return { status: response.status, location: response.headers.get("location"), text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const budi = await login("budi@dora.local");
check("employee login", budi.status === 303 && budi.location === "/overview", `${budi.status} ${budi.location}`);
const overview = await get("/overview", budi.jar);
check("employee overview", overview.status === 200 && overview.text.includes("My attendance today") && !overview.text.includes("Cendana") && !overview.text.includes("Payroll net"), overview.status);
const payroll = await get("/payroll", budi.jar);
check("employee payroll blocked", [302, 303, 307, 308].includes(payroll.status) && (payroll.location || "").startsWith("/forbidden"), `${payroll.status} ${payroll.location}`);
const payslip = await get("/me/payslip", budi.jar);
check("payslip asks for password", payslip.status === 200 && payslip.text.includes("type=\"password\""), payslip.status);
const clock = await get("/me/attendance", budi.jar);
check("clock page", clock.status === 200 && clock.text.includes("photo") && clock.text.includes("GPS"), clock.status);

const hr = await login("hr@dora.local");
const directory = await get("/employees", hr.jar);
check("HR directory hides other tenant", directory.status === 200 && directory.text.includes("Budi") && !directory.text.includes("Cendana"), directory.status);
const cendanaDirect = await get("/employees?q=Cendana", hr.jar);
check("HR search hides other tenant", cendanaDirect.status === 200 && !cendanaDirect.text.includes("Cendana Staff"));

const recruiter = await login("recruiter@dora.local");
const scoped = await get("/employees", recruiter.jar);
check("recruiter sees Engineering subtree", scoped.status === 200 && scoped.text.includes("Budi Santoso") && scoped.text.includes("Sari Manager") && !scoped.text.includes("Rina HR") && !scoped.text.includes("Andi Payroll") && !scoped.text.includes("Cendana Staff"));
const recruiterOverview = await get("/overview", recruiter.jar);
check("recruiter standard layout", recruiterOverview.status === 200 && recruiterOverview.text.includes("Active employees") && !recruiterOverview.text.includes("Payroll net"));

const platform = await login("platform@dora.local");
const tenants = await get("/platform/tenants", platform.jar);
check("platform tenants", tenants.status === 200 && tenants.text.includes("Cendana") && tenants.text.includes("DORA"), tenants.status);

const other = await login("cendana.admin@dora.local");
const otherOrg = await get("/organization", other.jar);
check("other tenant isolation", otherOrg.status === 200 && otherOrg.text.includes("Cendana") && !otherOrg.text.includes("Budi Santoso") && !otherOrg.text.includes("DORA Demo"), otherOrg.status);

const manager = await login("manager@dora.local");
const approvals = await get("/approvals/pending", manager.jar);
check("manager pending approvals", approvals.status === 200 && approvals.text.includes("Approve"), approvals.status);

function flashOf(location) {
  if (!location) return "";
  const url = new URL(location, base);
  return url.searchParams.get("error") || url.searchParams.get("ok") || "";
}

async function postForm(jar, path, html, marker, extra = {}) {
  const chunk = html.split("<form").slice(1).find((part) => part.includes(marker));
  if (!chunk) return { status: 0, location: "", missing: true };
  const action = chunk.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  if (!action) return { status: 0, location: "", missing: true };
  const body = new FormData();
  body.set(action, "");
  for (const match of chunk.matchAll(/<input\b[^>]*>/g)) {
    const tag = match[0];
    const name = tag.match(/name="([^"]+)"/)?.[1];
    if (!name || name.startsWith("$ACTION")) continue;
    if (tag.includes('type="checkbox"') || tag.includes('type="file"')) continue;
    body.set(name, tag.match(/value="([^"]*)"/)?.[1] ?? "");
  }
  for (const match of chunk.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected = match[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) || match[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/) || match[2].match(/<option[^>]*value="([^"]*)"/);
    body.set(match[1], selected?.[1] ?? "");
  }
  for (const [name, value] of Object.entries(extra)) body.set(name, value);
  const response = await fetch(`${base}${path}`, { method: "POST", body, redirect: "manual", headers: { cookie: cookieHeader(jar) } });
  cookiesFrom(response, jar);
  return { status: response.status, location: response.headers.get("location") || "", missing: false };
}

const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const beforeLeave = await get("/me/leave", budi.jar);
const beforeRemaining = Number(visible(beforeLeave.text).match(/Annual leave \d+: (\d+) remaining/)?.[1]);
const leaveDecision = await postForm(manager.jar, "/approvals/pending", approvals.text, "Leave:", { decision: "APPROVED", note: "Approved in verification" });
check("manager approves leave", leaveDecision.status === 303 && flashOf(leaveDecision.location) === "Leave decision saved.", flashOf(leaveDecision.location));
const afterApprove = await get("/me/leave", budi.jar);
const approvedRemaining = Number(visible(afterApprove.text).match(/Annual leave \d+: (\d+) remaining/)?.[1]);
check("approved leave reduces balance", approvedRemaining === beforeRemaining - 1, `${beforeRemaining} -> ${approvedRemaining}`);
const cancelled = await postForm(budi.jar, "/me/leave", afterApprove.text, "Cancel");
check("employee cancels future leave", cancelled.status === 303 && !flashOf(cancelled.location).toLowerCase().includes("fail"), flashOf(cancelled.location) || String(cancelled.status));
const afterCancel = await get("/me/leave", budi.jar);
const cancelledRemaining = Number(visible(afterCancel.text).match(/Annual leave \d+: (\d+) remaining/)?.[1]);
check("cancel restores balance", cancelledRemaining === beforeRemaining, `${approvedRemaining} -> ${cancelledRemaining}`);

const andi = await login("payroll.andi@dora.local");
const processing = await get("/payroll/processing", andi.jar);
const processed = await postForm(andi.jar, "/payroll/processing", processing.text, "Process payroll");
check("payroll process", processed.status === 303 && flashOf(processed.location).includes("calculated"), flashOf(processed.location));
const processedPage = await get(processed.location || "/payroll/processing", andi.jar);
const submitted = await postForm(andi.jar, "/payroll/processing", processedPage.text, "Submit for approval");
check("payroll submit", submitted.status === 303 && !flashOf(submitted.location).toLowerCase().includes("not allowed") && flashOf(submitted.location) !== "", flashOf(submitted.location));
const approvalPage = await get("/payroll/approval", andi.jar);
const selfApproval = await postForm(andi.jar, "/payroll/approval", approvalPage.text, "Approve", { decision: "APPROVED", note: "self" });
check("preparer cannot self-approve", flashOf(selfApproval.location).includes("cannot approve"), flashOf(selfApproval.location));
const dewi = await login("payroll.dewi@dora.local");
const dewiPage = await get("/payroll/approval", dewi.jar);
const dewiDecision = await postForm(dewi.jar, "/payroll/approval", dewiPage.text, "Approve", { decision: "APPROVED", note: "Reviewed" });
check("different payroll user approves", dewiDecision.status === 303 && flashOf(dewiDecision.location) === "Payroll decision saved.", flashOf(dewiDecision.location));
const lockedPage = await get(dewiDecision.location || "/payroll/approval", andi.jar);
const locked = await postForm(andi.jar, "/payroll/approval", lockedPage.text, "Finalize and lock", { confirm: "on" });
check("finalize locks without publishing", locked.status === 303 && flashOf(locked.location).includes("not visible"), flashOf(locked.location));
const slips = await get("/payroll/payslips", andi.jar);
check("locked slip stays unpublished", slips.text.includes("Locked, not published"));
const published = await postForm(andi.jar, "/payroll/payslips", slips.text, "Publish payslips");
check("manual publish", published.status === 303, flashOf(published.location) || String(published.status));
const opened = await postForm(budi.jar, "/me/payslip", (await get("/me/payslip", budi.jar)).text, "Show payslip", { password: "Dora#2026" });
const openedPage = await get(opened.location || "/me/payslip", budi.jar);
check("payslip opens after password", openedPage.status === 200 && openedPage.text.includes("Net"), flashOf(opened.location));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
