import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function rupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `Rp ${sign}${Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export async function buildPayslipPdf(item: {
  net: number;
  breakdown: string;
  period: { name: string; payDate: string };
  employee: { fullName: string; company: { name: string } };
}) {
  const lines = JSON.parse(item.breakdown) as { name: string; kind: string; amount: number }[];
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const draw = (text: string, size: number, use = font) => {
    page.drawText(text.slice(0, 90), { x: 48, y, size, font: use, color: rgb(0.09, 0.13, 0.2) });
    y -= size + 8;
  };
  draw(item.employee.company.name, 11);
  draw("Payslip", 20, bold);
  draw(`${item.period.name} · Pay date ${item.period.payDate}`, 12);
  draw(item.employee.fullName, 14, bold);
  y -= 6;
  const earnings = lines.filter((line) => line.kind === "EARNING");
  const deductions = lines.filter((line) => line.kind === "DEDUCTION");
  const employer = lines.filter((line) => line.kind === "INFO");
  const gross = earnings.reduce((sum, line) => sum + line.amount, 0);
  const deduction = deductions.reduce((sum, line) => sum + line.amount, 0);
  draw("Earnings", 12, bold);
  for (const line of earnings) draw(`${line.name}    ${rupiah(line.amount)}`, 11);
  draw(`Total earnings    ${rupiah(gross)}`, 11, bold);
  draw("Deductions", 12, bold);
  for (const line of deductions) draw(`${line.name}    ${rupiah(line.amount)}`, 11);
  draw(`Total deduction    ${rupiah(deduction)}`, 11, bold);
  y -= 4;
  draw(`Take home pay    ${rupiah(item.net)}`, 14, bold);
  if (employer.length) {
    y -= 4;
    draw("Employer contributions (not deducted)", 12, bold);
    for (const line of employer) draw(`${line.name}    ${rupiah(line.amount)}`, 11);
  }
  return doc.save();
}
