import { BenchWorkspace } from "@/components/bench-workspace";

export default async function BenchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BenchWorkspace assemblyId={id} />;
}
