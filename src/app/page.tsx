import { Suspense } from "react";
import { AssemblyRegistry } from "@/components/assembly-registry";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1440px] w-full mx-auto px-4 md:px-6 pt-8 space-y-6">
          <Skeleton className="h-[300px] w-full bg-[#E2E8F0]" />
          <Skeleton className="h-[260px] w-full bg-[#E2E8F0]" />
        </div>
      }
    >
      <AssemblyRegistry />
    </Suspense>
  );
}
