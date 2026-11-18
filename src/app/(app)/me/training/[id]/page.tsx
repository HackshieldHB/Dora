import { TrainingDetail } from "@/components/training-detail";

export default async function MyTrainingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  return <TrainingDetail id={id} tab={query.tab} ok={query.ok} error={query.error} />;
}
