export type PublicHoliday = { date: string; name: string; kind: "NATIONAL" | "JOINT" };

const FIXED = [
  ["01-01", "Tahun Baru"],
  ["05-01", "Hari Buruh Internasional"],
  ["06-01", "Hari Lahir Pancasila"],
  ["08-17", "Proklamasi Kemerdekaan"],
  ["12-25", "Kelahiran Yesus Kristus"],
] as const;

const DECREE: Record<number, PublicHoliday[]> = {
  2026: [
    { date: "2026-01-01", name: "Tahun Baru 2026", kind: "NATIONAL" },
    { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad", kind: "NATIONAL" },
    { date: "2026-02-16", name: "Cuti bersama Tahun Baru Imlek", kind: "JOINT" },
    { date: "2026-02-17", name: "Tahun Baru Imlek", kind: "NATIONAL" },
    { date: "2026-03-18", name: "Cuti bersama Hari Suci Nyepi", kind: "JOINT" },
    { date: "2026-03-19", name: "Hari Suci Nyepi", kind: "NATIONAL" },
    { date: "2026-03-20", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2026-03-21", name: "Idul Fitri", kind: "NATIONAL" },
    { date: "2026-03-22", name: "Idul Fitri", kind: "NATIONAL" },
    { date: "2026-03-23", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2026-03-24", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2026-04-03", name: "Wafat Yesus Kristus", kind: "NATIONAL" },
    { date: "2026-04-05", name: "Kebangkitan Yesus Kristus", kind: "NATIONAL" },
    { date: "2026-05-01", name: "Hari Buruh Internasional", kind: "NATIONAL" },
    { date: "2026-05-14", name: "Kenaikan Yesus Kristus", kind: "NATIONAL" },
    { date: "2026-05-15", name: "Cuti bersama Kenaikan Yesus Kristus", kind: "JOINT" },
    { date: "2026-05-27", name: "Idul Adha", kind: "NATIONAL" },
    { date: "2026-05-28", name: "Cuti bersama Idul Adha", kind: "JOINT" },
    { date: "2026-05-31", name: "Hari Raya Waisak", kind: "NATIONAL" },
    { date: "2026-06-01", name: "Hari Lahir Pancasila", kind: "NATIONAL" },
    { date: "2026-06-16", name: "Tahun Baru Islam 1 Muharam", kind: "NATIONAL" },
    { date: "2026-08-17", name: "Proklamasi Kemerdekaan", kind: "NATIONAL" },
    { date: "2026-08-25", name: "Maulid Nabi Muhammad", kind: "NATIONAL" },
    { date: "2026-12-24", name: "Cuti bersama Kelahiran Yesus Kristus", kind: "JOINT" },
    { date: "2026-12-25", name: "Kelahiran Yesus Kristus", kind: "NATIONAL" },
  ],
  2027: [
    { date: "2027-01-01", name: "Tahun Baru 2027", kind: "NATIONAL" },
    { date: "2027-01-05", name: "Isra Mikraj Nabi Muhammad", kind: "NATIONAL" },
    { date: "2027-02-05", name: "Cuti bersama Tahun Baru Imlek", kind: "JOINT" },
    { date: "2027-02-06", name: "Tahun Baru Imlek", kind: "NATIONAL" },
    { date: "2027-03-08", name: "Hari Suci Nyepi", kind: "NATIONAL" },
    { date: "2027-03-09", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2027-03-10", name: "Idul Fitri", kind: "NATIONAL" },
    { date: "2027-03-11", name: "Idul Fitri", kind: "NATIONAL" },
    { date: "2027-03-12", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2027-03-15", name: "Cuti bersama Idul Fitri", kind: "JOINT" },
    { date: "2027-03-25", name: "Cuti bersama Wafat Yesus Kristus", kind: "JOINT" },
    { date: "2027-03-26", name: "Wafat Yesus Kristus", kind: "NATIONAL" },
    { date: "2027-03-28", name: "Kebangkitan Yesus Kristus", kind: "NATIONAL" },
    { date: "2027-05-01", name: "Hari Buruh Internasional", kind: "NATIONAL" },
    { date: "2027-05-06", name: "Kenaikan Yesus Kristus", kind: "NATIONAL" },
    { date: "2027-05-17", name: "Idul Adha", kind: "NATIONAL" },
    { date: "2027-05-18", name: "Cuti bersama Idul Adha", kind: "JOINT" },
    { date: "2027-05-19", name: "Cuti bersama Hari Raya Waisak", kind: "JOINT" },
    { date: "2027-05-20", name: "Hari Raya Waisak", kind: "NATIONAL" },
    { date: "2027-06-01", name: "Hari Lahir Pancasila", kind: "NATIONAL" },
    { date: "2027-06-06", name: "Tahun Baru Islam 1 Muharam", kind: "NATIONAL" },
    { date: "2027-08-15", name: "Maulid Nabi Muhammad", kind: "NATIONAL" },
    { date: "2027-08-17", name: "Proklamasi Kemerdekaan", kind: "NATIONAL" },
    { date: "2027-12-24", name: "Cuti bersama Kelahiran Yesus Kristus", kind: "JOINT" },
    { date: "2027-12-25", name: "Kelahiran Yesus Kristus", kind: "NATIONAL" },
    { date: "2027-12-26", name: "Isra Mikraj Nabi Muhammad", kind: "NATIONAL" },
  ],
};

export function publicHolidays(year: number): { days: PublicHoliday[]; decree: boolean } {
  const listed = DECREE[year];
  if (listed) return { days: listed, decree: true };
  return {
    decree: false,
    days: FIXED.map(([monthDay, name]) => ({ date: `${year}-${monthDay}`, name, kind: "NATIONAL" as const })),
  };
}
