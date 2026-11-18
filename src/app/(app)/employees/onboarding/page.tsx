import { requirePerm } from "@/lib/context";
import { lookups } from "@/server/lookups";
import { saveEmployeeAction } from "@/app/actions";
import { Banner, PageTitle } from "@/components/ui";
import { EmployeeForm } from "@/components/employee-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requirePerm("employees.manage");
  const params = await searchParams;
  const data = await lookups(ctx.companyId || "");
  return (
    <div>
      <PageTitle title="Employee Onboarding" subtitle="Save Draft keeps the person inactive and without ESS access." />
      <Banner error={params.error} />
      <EmployeeForm action={saveEmployeeAction} data={data} showSalary={ctx.permissions.has("employees.salary")} />
    </div>
  );
}
