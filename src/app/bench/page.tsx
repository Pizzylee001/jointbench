import { redirect } from "next/navigation";
import { SEED_ASSEMBLIES } from "@/lib/seed-assemblies";

export default function BenchIndexPage() {
  redirect(`/bench/${SEED_ASSEMBLIES[0].id}`);
}
