import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { hasPerm, type Ctx } from "@/lib/context";
import { todayJakarta } from "@/lib/format";
import { saveEmployeeFile } from "@/lib/files";
import { employeeWhere, requireCompany } from "./scope";

const CATEGORIES = ["Technical Skill", "Soft Skill", "Leadership", "Compliance", "Other"];
const METHODS = ["ONLINE", "ONSITE", "HYBRID"];
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function canReadTraining(ctx: Ctx) {
  return hasPerm(ctx, "training.view") || hasPerm(ctx, "training.self") || hasPerm(ctx, "training.manage");
}

export function trainingPhase(row: { sessionDate: string; status: string }, today = todayJakarta()) {
  if (row.status === "CANCELLED") return "CANCELLED";
  if (row.sessionDate > today) return "UPCOMING";
  if (row.sessionDate === today) return "ONGOING";
  return "COMPLETED";
}

function score(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`${label} must be from 1 to 5.`);
  return value;
}

function assertManage(ctx: Ctx) {
  if (!hasPerm(ctx, "training.manage")) throw new Error("You do not have permission to manage training.");
  return requireCompany(ctx);
}

export function trainingWhere(ctx: Ctx): Prisma.TrainingWhereInput {
  const companyId = requireCompany(ctx);
  if (hasPerm(ctx, "training.manage")) return { companyId };
  if (hasPerm(ctx, "training.view") && ctx.dataScope === "DIRECT_REPORTS" && ctx.employeeId) {
    return {
      companyId,
      OR: [
        { enrollment: "OPEN", status: { not: "CANCELLED" } },
        { participants: { some: { employee: { OR: [{ id: ctx.employeeId }, { managerId: ctx.employeeId }] } } } },
      ],
    };
  }
  if (hasPerm(ctx, "training.view")) return { companyId };
  return {
    companyId,
    OR: [
      { enrollment: "OPEN", status: { not: "CANCELLED" } },
      { participants: { some: { employeeId: ctx.employeeId || "__none__" } } },
    ],
  };
}

function participantScope(ctx: Ctx): Prisma.TrainingParticipantWhereInput {
  if (hasPerm(ctx, "training.manage") || (hasPerm(ctx, "training.view") && ctx.dataScope === "COMPANY")) return {};
  if (hasPerm(ctx, "training.view") && ctx.dataScope === "DIRECT_REPORTS") {
    const self = ctx.employeeId || "__none__";
    return { employee: { OR: [{ id: self }, { managerId: self }] } };
  }
  return { employeeId: ctx.employeeId || "__none__" };
}

const include = { participants: { include: { employee: { include: { department: true } }, evaluation: true } } } as const;

export async function listTrainings(ctx: Ctx, query = "") {
  if (!canReadTraining(ctx)) throw new Error("You do not have permission to view training.");
  const needle = query.trim();
  const scope = trainingWhere(ctx);
  return prisma.training.findMany({
    where: needle
      ? { AND: [scope, { OR: [{ name: { contains: needle } }, { trainer: { contains: needle } }, { category: { contains: needle } }] }] }
      : scope,
    include,
    orderBy: { sessionDate: "asc" },
  });
}

export async function trainingOverview(ctx: Ctx) {
  if (!hasPerm(ctx, "training.view") && !hasPerm(ctx, "training.manage")) throw new Error("You do not have permission to view training.");
  const rows = await listTrainings(ctx);
  const today = todayJakarta();
  const teamOnly = ctx.dataScope === "DIRECT_REPORTS" && !hasPerm(ctx, "training.manage");
  const participants = rows.flatMap((row) => row.participants.filter((person) => !teamOnly || person.employee.managerId === ctx.employeeId || person.employeeId === ctx.employeeId));
  const ratings = participants.map((person) => person.evaluation?.overall).filter((value): value is number => value != null);
  return {
    total: rows.length,
    active: rows.filter((row) => trainingPhase(row, today) === "UPCOMING" || trainingPhase(row, today) === "ONGOING").length,
    participants: participants.length,
    done: rows.filter((row) => trainingPhase(row, today) === "COMPLETED").length,
    average: ratings.length ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : 0,
    rows,
  };
}

function readTraining(input: {
  name: string;
  category: string;
  description: string;
  objective: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  method: string;
  place: string;
  trainer: string;
  capacity: number;
  target: string;
  materialUrl: string;
  enrollment: string;
}) {
  if (!input.name.trim()) throw new Error("Training name is required.");
  if (!CATEGORIES.includes(input.category)) throw new Error("Choose a training category.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) throw new Error("Choose the training date.");
  if (!CLOCK_TIME.test(input.startTime) || !CLOCK_TIME.test(input.endTime)) throw new Error("Enter the start and end time.");
  if (input.endTime <= input.startTime) throw new Error("The end time must be later than the start time.");
  if (!METHODS.includes(input.method)) throw new Error("Choose online, onsite, or hybrid.");
  if (!input.place.trim()) throw new Error("Enter the location or meeting link.");
  if (!input.trainer.trim()) throw new Error("Enter the trainer name.");
  if (!Number.isInteger(input.capacity) || input.capacity < 1) throw new Error("Enter a participant quota of at least 1.");
  if (input.materialUrl.trim() && !/^https?:\/\//i.test(input.materialUrl.trim())) throw new Error("The material link must start with http:// or https://.");
  return {
    name: input.name.trim(),
    category: input.category,
    description: input.description.trim(),
    objective: input.objective.trim(),
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    endTime: input.endTime,
    method: input.method,
    place: input.place.trim(),
    trainer: input.trainer.trim(),
    capacity: input.capacity,
    target: input.target.trim(),
    materialUrl: input.materialUrl.trim(),
    enrollment: input.enrollment === "ASSIGNED" ? "ASSIGNED" : "OPEN",
  };
}

async function notifyEmployee(employeeId: string, title: string, body: string) {
  const user = await prisma.user.findFirst({ where: { employeeId, status: "ACTIVE" } });
  if (user) await notify(user.id, title, body, "/me/training");
}

export async function createTraining(ctx: Ctx, input: Parameters<typeof readTraining>[0] & { employeeId: string }) {
  const companyId = assertManage(ctx);
  const data = readTraining(input);
  if (input.employeeId) {
    const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, ...employeeWhere(ctx), status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } } });
    if (!employee) throw new Error("Choose an employee in your company.");
  }
  const training = await prisma.training.create({ data: { ...data, companyId } });
  if (input.employeeId) await assignParticipant(ctx, training.id, input.employeeId);
  await audit(ctx, "training.create", "Training", training.id, training.name);
  return training.id;
}

export async function updateTraining(ctx: Ctx, id: string, input: Parameters<typeof readTraining>[0]) {
  const companyId = assertManage(ctx);
  const current = await prisma.training.findFirst({ where: { id, companyId } });
  if (!current || current.status === "CANCELLED") throw new Error("That training cannot be edited.");
  const data = readTraining(input);
  if (data.capacity < await prisma.trainingParticipant.count({ where: { trainingId: id, status: { not: "CANCELLED" } } })) {
    throw new Error("The quota cannot be lower than the current participants.");
  }
  await prisma.training.update({ where: { id }, data });
  await audit(ctx, "training.update", "Training", id, data.name);
  return "Training saved.";
}

export async function cancelTraining(ctx: Ctx, id: string) {
  const companyId = assertManage(ctx);
  const current = await prisma.training.findFirst({ where: { id, companyId, status: { not: "CANCELLED" } } });
  if (!current) throw new Error("That training cannot be cancelled.");
  await prisma.training.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(ctx, "training.cancel", "Training", id, current.name);
  return "Training cancelled.";
}

export async function getTraining(ctx: Ctx, id: string) {
  if (!canReadTraining(ctx)) throw new Error("You do not have permission to view training.");
  const training = await prisma.training.findFirst({ where: { id, ...trainingWhere(ctx) }, include });
  if (!training) throw new Error("Training was not found.");
  const participants = training.participants.filter((person) => {
    const scope = participantScope(ctx);
    if (!("employeeId" in scope) && !("employee" in scope)) return true;
    if ("employeeId" in scope) return person.employeeId === scope.employeeId;
    return person.employeeId === ctx.employeeId || person.employee.managerId === ctx.employeeId;
  });
  return { ...training, participants };
}

async function seatLeft(trainingId: string, capacity: number) {
  const used = await prisma.trainingParticipant.count({ where: { trainingId, status: { not: "CANCELLED" } } });
  if (used >= capacity) throw new Error("This training has no seats left.");
}

export async function assignParticipant(ctx: Ctx, trainingId: string, employeeId: string) {
  const companyId = assertManage(ctx);
  const training = await prisma.training.findFirst({ where: { id: trainingId, companyId, status: { not: "CANCELLED" } } });
  if (!training) throw new Error("That training cannot take participants.");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, ...employeeWhere(ctx), status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } } });
  if (!employee) throw new Error("Choose an employee in your company.");
  const existing = await prisma.trainingParticipant.findUnique({ where: { trainingId_employeeId: { trainingId, employeeId } } });
  if (existing && existing.status !== "CANCELLED") throw new Error("That employee is already on this training.");
  await seatLeft(trainingId, training.capacity);
  const participant = existing
    ? await prisma.trainingParticipant.update({ where: { id: existing.id }, data: { status: "ASSIGNED", attendance: "" } })
    : await prisma.trainingParticipant.create({ data: { trainingId, employeeId, status: "ASSIGNED" } });
  await notifyEmployee(employeeId, "Training assigned", training.name);
  await audit(ctx, "training.assign", "TrainingParticipant", participant.id, employee.fullName);
  return "Participant assigned.";
}

export async function removeParticipant(ctx: Ctx, participantId: string) {
  const companyId = assertManage(ctx);
  const participant = await prisma.trainingParticipant.findFirst({ where: { id: participantId, training: { companyId } }, include: { training: true } });
  if (!participant || participant.training.status === "CANCELLED") throw new Error("That participant cannot be removed.");
  if (participant.attendance || !["ASSIGNED", "REGISTERED"].includes(participant.status)) throw new Error("Attendance has already been recorded for this participant.");
  await prisma.trainingParticipant.delete({ where: { id: participant.id } });
  await audit(ctx, "training.unassign", "TrainingParticipant", participant.id, participant.employeeId);
  return "Participant removed.";
}

export async function registerTraining(ctx: Ctx, trainingId: string) {
  if (!hasPerm(ctx, "training.self") && !hasPerm(ctx, "training.manage")) throw new Error("You do not have permission to register for training.");
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const training = await prisma.training.findFirst({ where: { id: trainingId, ...trainingWhere(ctx) } });
  if (!training || training.status === "CANCELLED" || training.enrollment !== "OPEN") throw new Error("This training is not open for registration.");
  if (training.sessionDate < todayJakarta()) throw new Error("This training has already finished.");
  const existing = await prisma.trainingParticipant.findUnique({ where: { trainingId_employeeId: { trainingId, employeeId: ctx.employeeId } } });
  if (existing && existing.status !== "CANCELLED") throw new Error("You are already registered for this training.");
  await seatLeft(trainingId, training.capacity);
  if (existing) await prisma.trainingParticipant.update({ where: { id: existing.id }, data: { status: "REGISTERED", attendance: "" } });
  else await prisma.trainingParticipant.create({ data: { trainingId, employeeId: ctx.employeeId, status: "REGISTERED" } });
  await audit(ctx, "training.register", "Training", trainingId, ctx.employeeId);
  return "You are registered for this training.";
}

export async function markAttendance(ctx: Ctx, participantId: string, attendance: string, completion: string) {
  const companyId = assertManage(ctx);
  const participant = await prisma.trainingParticipant.findFirst({ where: { id: participantId, training: { companyId } } });
  if (!participant) throw new Error("Participant was not found.");
  const present = attendance === "PRESENT";
  if (!present && attendance !== "ABSENT") throw new Error("Choose present or absent.");
  const status = present ? (completion === "COMPLETED" ? "COMPLETED" : "ATTENDED") : "ABSENT";
  await prisma.trainingParticipant.update({
    where: { id: participant.id },
    data: { attendance: present ? "PRESENT" : "ABSENT", status },
  });
  await audit(ctx, "training.attendance", "TrainingParticipant", participant.id, status);
  return "Training attendance saved.";
}

export async function submitEvaluation(ctx: Ctx, participantId: string, input: { overall: number; material: number; delivery: number; facility: number; relevance: number; comment: string }) {
  if (!ctx.employeeId) throw new Error("Your user is not linked to an employee record.");
  const participant = await prisma.trainingParticipant.findFirst({ where: { id: participantId, employeeId: ctx.employeeId }, include: { training: true, evaluation: true } });
  if (!participant) throw new Error("This training evaluation is not yours.");
  if (participant.evaluation) throw new Error("Evaluation has already been sent.");
  if (participant.attendance !== "PRESENT" && !["ATTENDED", "COMPLETED"].includes(participant.status)) throw new Error("Evaluation opens after you are marked present.");
  if (participant.training.sessionDate > todayJakarta()) throw new Error("Evaluation opens after the training date.");
  await prisma.trainingEvaluation.create({
    data: {
      participantId,
      overall: score(input.overall, "Overall rating"),
      material: score(input.material, "Material quality"),
      delivery: score(input.delivery, "Trainer delivery"),
      facility: score(input.facility, "Facility or media"),
      relevance: score(input.relevance, "Job relevance"),
      comment: input.comment.trim(),
    },
  });
  await audit(ctx, "training.evaluate", "TrainingParticipant", participantId, String(input.overall));
  return "Evaluation sent.";
}

export async function uploadCertificate(ctx: Ctx, participantId: string, file: File) {
  const companyId = assertManage(ctx);
  const participant = await prisma.trainingParticipant.findFirst({ where: { id: participantId, training: { companyId } } });
  if (!participant || !["ATTENDED", "COMPLETED"].includes(participant.status)) throw new Error("A certificate can be added after the participant completes the training.");
  const fileId = await saveEmployeeFile({ companyId, employeeId: participant.employeeId, file });
  await prisma.trainingParticipant.update({ where: { id: participant.id }, data: { certificateId: fileId } });
  await audit(ctx, "training.certificate", "TrainingParticipant", participant.id, fileId);
  return "Certificate saved.";
}

export async function evaluationRows(ctx: Ctx) {
  if (!hasPerm(ctx, "training.manage")) throw new Error("You do not have permission to view training evaluations.");
  return prisma.trainingEvaluation.findMany({
    where: { participant: { training: { companyId: requireCompany(ctx) } } },
    include: { participant: { include: { employee: { include: { department: true } }, training: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function historyRows(ctx: Ctx) {
  if (!canReadTraining(ctx)) throw new Error("You do not have permission to view training.");
  return prisma.trainingParticipant.findMany({
    where: { ...participantScope(ctx), training: trainingWhere(ctx) },
    include: { employee: { include: { department: true } }, training: true, evaluation: true },
    orderBy: { training: { sessionDate: "desc" } },
  });
}

export async function companyEmployees(ctx: Ctx) {
  assertManage(ctx);
  return prisma.employee.findMany({
    where: { ...employeeWhere(ctx), status: { in: ["ACTIVE", "PENDING OFFBOARDING"] } },
    include: { department: true },
    orderBy: { fullName: "asc" },
  });
}
