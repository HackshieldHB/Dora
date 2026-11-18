import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { activeDelegate, notify } from "@/lib/notify";
import { saveEmployeeFile } from "@/lib/files";
import { hasPerm, type Ctx } from "@/lib/context";
import { assertDecision } from "@/lib/decision";
import { DIRECT_PROFILE_FIELDS, isSensitiveProfileField, normalizeNpwp, onboardingGaps } from "@/lib/domain";
import { temporaryPassword, hashPassword, verifyPassword } from "@/lib/password";
import { todayJakarta } from "@/lib/format";
import { employeeWhere, requireCompany } from "./scope";
import { usersWithPermission } from "./access";
import { placementError } from "@/lib/placement";
import { assertAssignableRole } from "./workflow";

const employeeInclude = {
  branch: true,
  location: true,
  department: true,
  position: true,
  manager: true,
  user: true,
} as const;

function employeeCodeOrder(code: string): number {
  const match = code.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export async function listEmployees(ctx: Ctx, filters: { q?: string; status?: string; branchId?: string; departmentId?: string; locationId?: string; sort?: string }) {
  const where = employeeWhere(ctx);
  const rows = await prisma.employee.findMany({
    where: {
      AND: [
        where,
        filters.status ? { status: filters.status } : {},
        filters.branchId ? { branchId: filters.branchId } : {},
        filters.departmentId ? { departmentId: filters.departmentId } : {},
        filters.locationId ? { locationId: filters.locationId } : {},
        filters.q
          ? { OR: [{ fullName: { contains: filters.q } }, { employeeCode: { contains: filters.q } }, { email: { contains: filters.q } }] }
          : {},
      ],
    },
    include: { branch: true, department: true, position: true, location: true },
    orderBy: { fullName: "asc" },
  });
  if (filters.sort === "asc" || filters.sort === "desc") {
    rows.sort((left, right) => {
      const diff = employeeCodeOrder(left.employeeCode) - employeeCodeOrder(right.employeeCode);
      if (diff !== 0) return filters.sort === "asc" ? diff : -diff;
      return filters.sort === "asc" ? left.employeeCode.localeCompare(right.employeeCode) : right.employeeCode.localeCompare(left.employeeCode);
    });
  }
  return rows;
}

export async function getEmployee(ctx: Ctx, id: string) {
  const employee = await prisma.employee.findFirst({
    where: { AND: [{ id }, employeeWhere(ctx)] },
    include: {
      ...employeeInclude,
      events: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      profileChanges: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!employee) throw new Error("Employee not found.");
  return employee;
}

export function canSeeSalary(ctx: Ctx): boolean {
  return hasPerm(ctx, "employees.salary");
}

export async function saveDraft(ctx: Ctx, input: Record<string, string>, id?: string) {
  const companyId = requireCompany(ctx);
  if (!hasPerm(ctx, "employees.manage")) throw new Error("You do not have permission to edit employees.");
  if (!input.fullName || !input.employeeCode) throw new Error("Name and employee ID are required to save a draft.");
  if (id) await getEmployee(ctx, id);
  const duplicate = await prisma.employee.findFirst({
    where: { companyId, employeeCode: input.employeeCode, NOT: id ? { id } : undefined },
  });
  if (duplicate) throw new Error("That employee ID is already used in this company.");
  const current = id ? await prisma.employee.findFirst({ where: { id, companyId }, include: { user: true } }) : null;
  let accessRoleId = "";
  if (input.accessRoleId) {
    const role = await assertAssignableRole(companyId, input.accessRoleId, current?.user?.roleId || current?.accessRoleId || "");
    accessRoleId = role.id;
  }
  if (input.locationId) {
    const location = await prisma.workLocation.findFirst({ where: { id: input.locationId, companyId } });
    if (!location) throw new Error("Work location not found.");
    const same = Boolean(current && current.locationId === input.locationId && (current.branchId || "") === (input.branchId || ""));
    const placement = placementError(input.branchId || "", location.branchId, same);
    if (placement) throw new Error(placement);
  }
  const data = {
    fullName: input.fullName,
    employeeCode: input.employeeCode,
    email: input.email || "",
    phone: input.phone || "",
    address: input.address || "",
    emergencyName: input.emergencyName || "",
    emergencyPhone: input.emergencyPhone || "",
    nik: input.nik || "",
    npwp: checkedNpwp(input.npwp || ""),
    birthDate: input.birthDate || "",
    ptkp: input.ptkp || "TK/0",
    branchId: input.branchId || null,
    locationId: input.locationId || null,
    departmentId: input.departmentId || null,
    positionId: input.positionId || null,
    managerId: input.managerId || null,
    joinDate: input.joinDate || "",
    employmentType: input.employmentType || "PERMANENT",
    contractEnd: input.contractEnd || "",
    bankName: input.bankName || "",
    bankAccount: input.bankAccount || "",
    bpjsHealthNo: input.bpjsHealthNo || "",
    bpjsHealthOn: input.bpjsHealthOn === "Ya",
    bpjsHealthClass: input.bpjsHealthClass || "",
    bpjsHealthStart: input.bpjsHealthStart || "",
    bpjsTkNo: input.bpjsTkNo || "",
    bpjsTkOn: input.bpjsTkOn === "Ya",
    bpjsJht: input.bpjsJht === "Ya",
    bpjsJkk: input.bpjsJkk === "Ya",
    bpjsJkm: input.bpjsJkm === "Ya",
    bpjsJp: input.bpjsJp === "Ya",
    bpjsTkStart: input.bpjsTkStart || "",
    taxStatus: input.taxStatus || "",
    ptkpStart: input.ptkpStart || "",
    ...(hasPerm(ctx, "employees.salary") ? { basicSalary: Number(input.basicSalary || 0) } : {}),
    ...(accessRoleId ? { accessRoleId } : {}),
  };
  if (data.bpjsHealthOn && !data.bpjsHealthNo) throw new Error("A BPJS Kesehatan number is required when the employee is enrolled.");
  if (data.bpjsTkOn && !data.bpjsTkNo) throw new Error("A BPJS Ketenagakerjaan number is required when the employee is enrolled.");
  const employee = id
    ? await prisma.employee.update({ where: { id }, data })
    : await prisma.employee.create({ data: { ...data, companyId, status: "DRAFT", basicSalary: data.basicSalary ?? 0 } });
  if (!id && !hasPerm(ctx, "employees.activate")) {
    const readers = await usersWithPermission(companyId, "employees.activate");
    await Promise.all(readers.filter((user) => user.id !== ctx.userId).map((user) => notify(
      user.id,
      "New draft employee",
      `${employee.fullName} was saved as a draft and still needs a basic salary and activation.`,
      `/employees/${employee.id}`,
    )));
  }
  await audit(ctx, id ? "employee.update" : "employee.draft", "Employee", employee.id, employee.employeeCode);
  const previousRoleId = current?.user?.roleId || current?.accessRoleId || "";
  if (accessRoleId && accessRoleId !== previousRoleId) {
    const [before, after] = await Promise.all([
      previousRoleId ? prisma.role.findUnique({ where: { id: previousRoleId } }) : null,
      prisma.role.findUnique({ where: { id: accessRoleId } }),
    ]);
    if (current?.user) await prisma.user.update({ where: { id: current.user.id }, data: { roleId: accessRoleId } });
    await audit(ctx, "employee.role", "Employee", employee.id, `${before?.name || "Employee"} → ${after?.name || ""}`);
  }
  return employee;
}

export async function activationGaps(ctx: Ctx, id: string) {
  const employee = await getEmployee(ctx, id);
  const companyId = requireCompany(ctx);
  const others = await prisma.employee.count({ where: { companyId, status: "ACTIVE", NOT: { id } } });
  return {
    employee,
    gaps: onboardingGaps({
      fullName: employee.fullName,
      employeeCode: employee.employeeCode,
      email: employee.email,
      departmentId: employee.departmentId || "",
      positionId: employee.positionId || "",
      branchId: employee.branchId || "",
      locationId: employee.locationId || "",
      joinDate: employee.joinDate,
      employmentType: employee.employmentType,
      managerId: employee.managerId || "",
      requireManager: others > 0,
    }),
    salaryWarning: employee.basicSalary <= 0,
  };
}

export async function activateEmployee(ctx: Ctx, id: string) {
  if (!hasPerm(ctx, "employees.activate")) throw new Error("You do not have permission to activate employees.");
  const { gaps, employee: draft } = await activationGaps(ctx, id);
  if (gaps.length) throw new Error(`Activation is blocked until these fields are complete: ${gaps.join(", ")}.`);
  if (draft.basicSalary <= 0) throw new Error("Basic salary is required before the employee can be activated.");
  const employee = await prisma.employee.update({ where: { id }, data: { status: "ACTIVE" } });
  await prisma.employmentEvent.create({
    data: {
      employeeId: id,
      changeType: "ACTIVATION",
      effectiveDate: todayJakarta(),
      beforeJson: JSON.stringify({ status: "DRAFT" }),
      afterJson: JSON.stringify({ status: "ACTIVE" }),
      actorId: ctx.userId,
    },
  });
  await audit(ctx, "employee.activate", "Employee", id, employee.employeeCode);
}

export async function inviteEmployee(ctx: Ctx, id: string) {
  if (!hasPerm(ctx, "employees.activate")) throw new Error("You do not have permission to invite an employee.");
  const employee = await getEmployee(ctx, id);
  if (employee.status !== "ACTIVE") throw new Error("A draft employee cannot receive ESS access.");
  if (employee.user) throw new Error("This employee already has a user account.");
  const companyId = requireCompany(ctx);
  const role = employee.accessRoleId
    ? await assertAssignableRole(companyId, employee.accessRoleId)
    : await prisma.role.findFirst({ where: { companyId, key: "employee" } });
  if (!role) throw new Error("The Employee role is missing.");
  const existing = await prisma.user.findUnique({ where: { email: employee.email } });
  if (existing) throw new Error("That email is already used by another account.");
  const password = temporaryPassword();
  await prisma.user.create({
    data: {
      companyId,
      email: employee.email,
      passwordHash: await hashPassword(password),
      roleId: role.id,
      employeeId: employee.id,
      mustChangePassword: true,
    },
  });
  const user = await prisma.user.findFirst({ where: { employeeId: employee.id } });
  if (user) await notify(user.id, "ESS invitation", `Your DORA account is ready. Temporary password: ${password}`, "/login");
  await audit(ctx, "employee.invite", "Employee", id, employee.email);
  return password;
}

export async function changeEmployment(ctx: Ctx, id: string, input: Record<string, string>) {
  if (!hasPerm(ctx, "employees.manage")) throw new Error("You do not have permission to change employment.");
  const employee = await getEmployee(ctx, id);
  if (!input.effectiveDate) throw new Error("An effective date is required.");
  if ((input.basicSalary || input.changeType === "SALARY") && !hasPerm(ctx, "employees.salary")) {
    throw new Error("Salary changes require the salary permission.");
  }
  const before = {
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    branchId: employee.branchId,
    locationId: employee.locationId,
    managerId: employee.managerId,
    employmentType: employee.employmentType,
    contractEnd: employee.contractEnd,
    basicSalary: employee.basicSalary,
    status: employee.status,
  };
  const after = {
    departmentId: input.departmentId || null,
    positionId: input.positionId || null,
    branchId: input.branchId || null,
    locationId: input.locationId || null,
    managerId: input.managerId || null,
    employmentType: input.employmentType || employee.employmentType,
    contractEnd: input.contractEnd || "",
    basicSalary: input.basicSalary ? Number(input.basicSalary) : employee.basicSalary,
    status: employee.status,
  };
  if (after.locationId) {
    const location = await prisma.workLocation.findFirst({ where: { id: after.locationId, companyId: employee.companyId } });
    if (!location) throw new Error("Work location not found.");
    const same = employee.locationId === after.locationId && (employee.branchId || "") === (after.branchId || "");
    const placement = placementError(after.branchId || "", location.branchId, same);
    if (placement) throw new Error(placement);
  }
  const applyNow = input.effectiveDate <= todayJakarta();
  await prisma.employmentEvent.create({
    data: {
      employeeId: id,
      changeType: input.changeType || "EMPLOYMENT",
      effectiveDate: input.effectiveDate,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      applied: applyNow,
      actorId: ctx.userId,
    },
  });
  if (applyNow) await prisma.employee.update({ where: { id }, data: after });
  await audit(ctx, "employee.employment", "Employee", id, `${input.changeType || "EMPLOYMENT"} ${input.effectiveDate}`);
  return applyNow ? "The change is applied." : "The change is scheduled and will apply on the effective date.";
}

export async function offboardEmployee(ctx: Ctx, id: string, input: Record<string, string | boolean>) {
  if (!hasPerm(ctx, "employees.manage")) throw new Error("You do not have permission to offboard employees.");
  const employee = await getEmployee(ctx, id);
  if (!input.exitType || !input.exitReason || !input.lastWorkingDay) throw new Error("Exit type, reason, and last working day are required.");
  if (employee.status === "INACTIVE" || employee.status === "PENDING OFFBOARDING" || employee.exitType) {
    throw new Error("Offboarding is already recorded for this employee.");
  }
  const data = {
    exitType: String(input.exitType),
    exitReason: String(input.exitReason),
    lastWorkingDay: String(input.lastWorkingDay),
    clearanceAccess: Boolean(input.clearanceAccess),
    clearanceAssets: Boolean(input.clearanceAssets),
    clearanceBpjs: Boolean(input.clearanceBpjs),
    finalPayrollDone: Boolean(input.finalPayrollDone),
    clearanceDone: Boolean(input.clearanceAccess) && Boolean(input.clearanceAssets) && Boolean(input.clearanceBpjs) && Boolean(input.finalPayrollDone),
  };
  const effective = data.lastWorkingDay < todayJakarta();
  const status = effective ? "INACTIVE" : "PENDING OFFBOARDING";
  await prisma.employee.update({ where: { id }, data: { ...data, status } });
  await prisma.employmentEvent.create({
    data: {
      employeeId: id,
      changeType: "OFFBOARDING",
      effectiveDate: data.lastWorkingDay,
      applied: effective,
      beforeJson: JSON.stringify({ status: employee.status }),
      afterJson: JSON.stringify({ ...data, status, recordedBy: ctx.fullName }),
      actorId: ctx.userId,
    },
  });
  if (effective) await prisma.user.updateMany({ where: { employeeId: id }, data: { status: "DISABLED" } });
  await audit(ctx, "employee.offboard", "Employee", id, `${status} ${data.lastWorkingDay}`);
  return effective
    ? "Offboarding recorded. The last working day has passed, so the status is INACTIVE."
    : "Offboarding recorded. The status is PENDING OFFBOARDING until the last working day has passed.";
}

function checkedNpwp(value: string) {
  const parsed = normalizeNpwp(value);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.value;
}

const DOCUMENT_KINDS = ["KTP", "NPWP", "SIM", "Ijazah", "Certificate", "Other"] as const;

function documentExpiry(value: string) {
  const expiresOn = value.trim();
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new Error("Enter a valid expiry date.");
  return expiresOn;
}

export async function addOwnDocument(ctx: Ctx, kind: string, label: string, file: File, expiresOn: string, training: { name: string; provider: string; date: string } = { name: "", provider: "", date: "" }) {
  if (!ctx.employeeId || !hasPerm(ctx, "employees.self")) throw new Error("You do not have a personal profile.");
  if (!DOCUMENT_KINDS.includes(kind as (typeof DOCUMENT_KINDS)[number])) throw new Error("Choose a document type.");
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  if (!employee) throw new Error("Your account is not linked to an employee.");
  const expiry = documentExpiry(expiresOn);
  const fileId = await saveEmployeeFile({ companyId: employee.companyId, employeeId: employee.id, file });
  const name = label.trim() ? `${kind} · ${label.trim().slice(0, 60)}` : kind;
  if (training.date && !/^\d{4}-\d{2}-\d{2}$/.test(training.date)) throw new Error("Enter a valid training date.");
  await prisma.employeeDocument.create({
    data: {
      employeeId: employee.id,
      name,
      fileId,
      expiresOn: expiry,
      trainingName: training.name.trim().slice(0, 80),
      trainingProvider: training.provider.trim().slice(0, 80),
      trainingDate: training.date,
    },
  });
  await audit(ctx, "profile.document", "Employee", employee.id, name);
  return "Document uploaded.";
}

export async function setPayslipPin(ctx: Ctx, currentPassword: string, pin: string, confirm: string) {
  if (!/^\d{6}$/.test(pin)) throw new Error("The payslip PIN must be 6 digits.");
  if (pin !== confirm) throw new Error("The PIN confirmation does not match.");
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new Error("The current password is wrong, so the PIN was not changed.");
  await prisma.user.update({ where: { id: user.id }, data: { payslipPinHash: await hashPassword(pin) } });
  await audit(ctx, "payslip.pin", "User", user.id, user.payslipPinHash ? "reset" : "set");
  return "Payslip PIN saved.";
}

export async function addDocument(ctx: Ctx, id: string, file: File, expiresOn: string) {
  if (!hasPerm(ctx, "employees.manage")) throw new Error("You do not have permission to add documents.");
  const employee = await getEmployee(ctx, id);
  const expiry = documentExpiry(expiresOn);
  const fileId = await saveEmployeeFile({ companyId: employee.companyId, employeeId: id, file });
  await prisma.employeeDocument.create({ data: { employeeId: id, name: file.name || "Document", fileId, expiresOn: expiry } });
  await audit(ctx, "employee.document", "Employee", id, file.name);
}

export async function updateOwnProfile(ctx: Ctx, input: Record<string, string>) {
  if (!ctx.employeeId || !hasPerm(ctx, "employees.self")) throw new Error("You do not have a personal profile.");
  const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId } });
  if (!employee || employee.status !== "ACTIVE") throw new Error("Your employee record is not active.");
  const direct: Record<string, string> = {};
  const sensitive: { field: string; oldValue: string; newValue: string }[] = [];
  for (const [field, raw] of Object.entries(input)) {
    let value = raw;
    if (field === "npwp") value = checkedNpwp(raw);
    if (field === "birthDate" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid birth date.");
    if (!value && value !== "") continue;
    const current = String((employee as Record<string, unknown>)[field] ?? "");
    if (current === value) continue;
    if (isSensitiveProfileField(field)) sensitive.push({ field, oldValue: current, newValue: value });
    else if ((DIRECT_PROFILE_FIELDS as readonly string[]).includes(field)) direct[field] = value;
  }
  if (Object.keys(direct).length) {
    await prisma.employee.update({ where: { id: employee.id }, data: direct });
    await prisma.employmentEvent.create({
      data: {
        employeeId: employee.id,
        changeType: "PROFILE",
        effectiveDate: todayJakarta(),
        beforeJson: JSON.stringify(Object.fromEntries(Object.keys(direct).map((key) => [key, (employee as Record<string, unknown>)[key] ?? ""]))),
        afterJson: JSON.stringify(direct),
        actorId: ctx.userId,
      },
    });
  }
  const companyId = requireCompany(ctx);
  const reviewers = await usersWithPermission(companyId, "employees.manage");
  for (const change of sensitive) {
    const row = await prisma.profileChange.create({
      data: { companyId, employeeId: employee.id, field: change.field, oldValue: change.oldValue, newValue: change.newValue, sensitive: true },
    });
    for (const reviewer of reviewers) {
      const delegate = await activeDelegate(reviewer.id, "PROFILE", companyId);
      const assignee = delegate && delegate !== ctx.userId ? delegate : reviewer.id;
      await prisma.approvalTask.create({
        data: {
          companyId,
          module: "PROFILE",
          subjectId: row.id,
          assigneeId: assignee,
          originalAssigneeId: reviewer.id,
          requesterId: ctx.userId,
          title: `Profile change: ${employee.fullName} / ${change.field}`,
          href: `/approvals/pending`,
        },
      });
      await notify(assignee, "Profile change waiting for HR", `${employee.fullName} requested a change to ${change.field}.`, "/approvals/pending");
    }
  }
  await audit(ctx, "profile.update", "Employee", employee.id, `${Object.keys(direct).length} direct, ${sensitive.length} sensitive`);
  return sensitive.length ? "Direct changes were saved. Sensitive changes are waiting for HR." : "Your profile was saved.";
}

export async function decideProfileChange(ctx: Ctx, changeId: string, decision: "APPROVED" | "REJECTED", note: string) {
  decision = assertDecision(decision, ["APPROVED", "REJECTED"]);
  if (!hasPerm(ctx, "employees.manage")) throw new Error("HR permission is required to review a sensitive profile change.");
  const companyId = requireCompany(ctx);
  const change = await prisma.profileChange.findFirst({ where: { id: changeId, companyId, status: "PENDING" }, include: { employee: true } });
  if (!change) throw new Error("The profile request was not found.");
  if (decision === "APPROVED") {
    const value = change.field === "basicSalary" ? Number(change.newValue) : change.newValue;
    await prisma.employee.update({ where: { id: change.employeeId }, data: { [change.field]: value } });
    if (change.field === "email") {
      const taken = await prisma.user.findFirst({ where: { email: change.newValue, NOT: { employeeId: change.employeeId } } });
      if (taken) throw new Error("That email is already used by another account.");
      await prisma.user.updateMany({ where: { employeeId: change.employeeId }, data: { email: change.newValue } });
    }
    await prisma.employmentEvent.create({
      data: {
        employeeId: change.employeeId,
        changeType: "PROFILE_SENSITIVE",
        effectiveDate: todayJakarta(),
        beforeJson: JSON.stringify({ [change.field]: change.oldValue }),
        afterJson: JSON.stringify({ [change.field]: change.newValue }),
        actorId: ctx.userId,
      },
    });
  }
  await prisma.profileChange.update({ where: { id: change.id }, data: { status: decision, reviewerId: ctx.userId, note } });
  const tasks = await prisma.approvalTask.findMany({ where: { companyId, module: "PROFILE", subjectId: change.id, status: "PENDING" } });
  for (const task of tasks) {
    await prisma.approvalTask.update({ where: { id: task.id }, data: { status: "DONE" } });
    await prisma.approvalDecision.create({ data: { taskId: task.id, actorId: ctx.userId, decision, note } });
  }
  const owner = await prisma.user.findFirst({ where: { employeeId: change.employeeId } });
  if (owner) await notify(owner.id, `Profile change ${decision.toLowerCase()}`, note || change.field, "/me/profile");
  await audit(ctx, "profile.review", "ProfileChange", change.id, decision);
}

export async function decideContract(ctx: Ctx, id: string, decision: "RENEW" | "END", nextEnd: string) {
  decision = assertDecision(decision, ["RENEW", "END"], "Choose whether to renew the contract.");
  if (!hasPerm(ctx, "employees.manage")) throw new Error("You do not have permission to decide a contract.");
  const employee = await getEmployee(ctx, id);
  if (!employee.contractEnd) throw new Error("This employee has no contract end date.");
  if (decision === "END") {
    await prisma.employee.update({ where: { id: employee.id }, data: { contractDecision: "END" } });
    await audit(ctx, "contract.decide", "Employee", employee.id, "END");
    return "The contract will not be renewed. Pay was not changed.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextEnd) || nextEnd <= employee.contractEnd) {
    throw new Error("The new contract end has to be after the current end date.");
  }
  await prisma.employee.update({ where: { id: employee.id }, data: { contractDecision: "RENEW", contractEnd: nextEnd } });
  await audit(ctx, "contract.decide", "Employee", employee.id, nextEnd);
  return `Contract extended to ${nextEnd}. Pay was not changed.`;
}
