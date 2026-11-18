import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.leaveBalance.findMany({ include: { leaveType: true, employee: true } });
const requests = await prisma.leaveRequest.findMany({ include: { employee: true }, orderBy: { createdAt: "desc" } });
console.log(rows.map((row) => `${row.employee.fullName} ${row.leaveType.name} ${row.year} entitled ${row.entitled} used ${row.used}`).join("\n"));
console.log("---");
console.log(requests.map((row) => `${row.employee.fullName} ${row.startDate} ${row.status} ${row.days}`).join("\n"));
await prisma.$disconnect();
