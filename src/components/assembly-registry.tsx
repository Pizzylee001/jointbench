"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  MagnifyingGlass,
  SlidersHorizontal,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { CalibrationStage2D } from "@/components/calibration-stage-2d";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAssemblies, resetSeedAssemblies } from "@/lib/assembly-store";
import type { AssemblyRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pass" | "fail";

export function AssemblyRegistry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReduced = useReducedMotion();

  const [assemblies, setAssemblies] = useState<AssemblyRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [scanNonce, setScanNonce] = useState(0);

  const statusParam = (searchParams.get("status") as StatusFilter | null) ?? "all";
  const queryParam = searchParams.get("q") ?? "";

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    statusParam === "pass" || statusParam === "fail" ? statusParam : "all"
  );
  const [searchQuery, setSearchQuery] = useState(queryParam);

  useEffect(() => {
    const loaded = loadAssemblies();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssemblies(loaded);
    if (loaded.length > 0) {
      setSelectedId((prev) => (prev && loaded.some((a) => a.id === prev) ? prev : loaded[0].id));
    }
  }, []);

  const updateUrlParams = (nextStatus: StatusFilter, nextQuery: string) => {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  };

  const handleFilterChange = (next: StatusFilter) => {
    setStatusFilter(next);
    updateUrlParams(next, searchQuery);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    updateUrlParams(statusFilter, value);
  };

  const filtered = useMemo(() => {
    if (!assemblies) return [];
    const q = searchQuery.trim().toLowerCase();
    return assemblies.filter((a) => {
      if (statusFilter === "pass" && a.lastRun?.status !== "pass") return false;
      if (statusFilter === "fail" && a.lastRun?.status !== "fail") return false;
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !a.lineageLabel.toLowerCase().includes(q) &&
        !a.joint.type.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [assemblies, statusFilter, searchQuery]);

  const activeAssembly = useMemo(() => {
    if (!assemblies || assemblies.length === 0) return null;
    return assemblies.find((a) => a.id === selectedId) ?? filtered[0] ?? assemblies[0];
  }, [assemblies, selectedId, filtered]);

  const counts = useMemo(() => {
    const list = assemblies ?? [];
    return {
      total: list.length,
      pass: list.filter((a) => a.lastRun?.status === "pass").length,
      fail: list.filter((a) => a.lastRun?.status === "fail").length,
    };
  }, [assemblies]);

  const handleSelectRow = (id: string) => {
    setSelectedId(id);
    setScanNonce((n) => n + 1);
  };

  const handleResetSeeds = () => {
    const fresh = resetSeedAssemblies();
    setAssemblies(fresh);
    setSelectedId(fresh[0]?.id ?? "");
    setStatusFilter("all");
    setSearchQuery("");
    router.replace("/", { scroll: false });
  };

  const enterMotion = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 6, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const },
      };

  return (
    <>
      <AppHeader assemblyCount={counts.total} activeBenchId={activeAssembly?.id} />

      <main className="max-w-[1440px] w-full mx-auto px-4 md:px-6 pt-5 pb-12 flex-1">
        {/* Upper Asymmetric 5/7 Band: Architectural Display + Live Interactive Stage */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-stretch mb-6">
          <motion.div
            {...enterMotion}
            className="lg:col-span-5 flex flex-col justify-between gap-5 py-1"
          >
            <div>
              <h1 className="font-display text-[30px] md:text-[38px] font-extrabold tracking-[-0.03em] leading-[1.06] text-[#0F1722]">
                Calibrate Lux3D splits for real robot arms.
              </h1>
              <p className="mt-3 text-[15px] leading-[1.55] text-[#455468] max-w-[52ch]">
                Bind Aholo Lux3D part-split sub-meshes to Revolute or Prismatic joints, sweep a
                3-DOF manipulator across physical limits to catch collisions early, and export
                simulation-ready URDF packages.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-[#C4CFD9] py-3">
              <div>
                <div className="font-display font-data text-[22px] font-bold text-[#0F1722] leading-tight">
                  {assemblies ? counts.total : "..."}
                </div>
                <div className="text-[12px] text-[#455468] mt-0.5">Lux3D Archived</div>
              </div>
              <div>
                <div className="font-display font-data text-[22px] font-bold text-[#065F46] leading-tight">
                  {assemblies ? counts.pass : "..."}
                </div>
                <div className="text-[12px] text-[#455468] mt-0.5">Arm-Verified</div>
              </div>
              <div>
                <div className="font-display font-data text-[22px] font-bold text-[#991B1B] leading-tight">
                  {assemblies ? counts.fail : "..."}
                </div>
                <div className="text-[12px] text-[#455468] mt-0.5">Collision Flagged</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/foundry"
                className="btn-machined-primary inline-flex items-center justify-center min-h-[44px] md:min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                New Lux3D Split
              </Link>
              <Link
                href={activeAssembly ? `/bench/${activeAssembly.id}` : "/bench"}
                className="btn-machined-secondary inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <SlidersHorizontal size={15} weight="bold" aria-hidden="true" />
                Inspect Selected in Bench
              </Link>
            </div>
          </motion.div>

          <motion.div
            {...(prefersReduced
              ? {}
              : {
                  initial: { opacity: 0, y: 6, scale: 0.985 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  transition: { duration: 0.28, delay: 0.045, ease: [0.23, 1, 0.32, 1] as const },
                })}
            className="lg:col-span-7"
          >
            {activeAssembly ? (
              <CalibrationStage2D assembly={activeAssembly} scanNonce={scanNonce} />
            ) : (
              <div className="calibration-chamber min-h-[304px] p-5 flex items-center justify-center">
                <Skeleton className="w-full h-[240px] bg-slate-800/70" />
              </div>
            )}
          </motion.div>
        </section>

        {/* Lower Full-Width Swiss Specification Ledger */}
        <motion.section
          {...(prefersReduced
            ? {}
            : {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.28, delay: 0.09, ease: [0.23, 1, 0.32, 1] as const },
              })}
          className="instrument-plate overflow-hidden"
          aria-label="Archived articulated assemblies"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#EFF3F7] border-b border-[#C4CFD9]">
            <div className="inline-flex items-center p-[3px] bg-[#E2E8F0] border border-[#C4CFD9] rounded-[7px] gap-0.5">
              {(
                [
                  { key: "all", label: `All (${counts.total})` },
                  { key: "pass", label: `Passed (${counts.pass})` },
                  { key: "fail", label: `Flagged (${counts.fail})` },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleFilterChange(tab.key)}
                    className={cn(
                      "relative min-h-[34px] px-3 rounded-[5px] text-[12px] font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]",
                      active ? "text-white" : "text-[#455468] hover:text-[#0F1722]"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={prefersReduced ? undefined : "registry-filter-thumb"}
                        transition={{ type: "spring", stiffness: 440, damping: 32 }}
                        className="absolute inset-0 bg-[#0F1722] rounded-[5px] z-0"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-[240px]">
                <MagnifyingGlass
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#455468] pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Filter by name or joint..."
                  aria-label="Filter assemblies"
                  className="pl-8 h-[36px] bg-white border-[#8FA0B3] text-[13px] text-[#0F1722]"
                />
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="btn-machined-secondary inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-[6px] text-[12px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                  >
                    <ArrowCounterClockwise size={14} aria-hidden="true" />
                    Reset Defaults
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Registry to Archived Lux3D Splits?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This restores the 3 bundled Aholo Lux3D G1-Turbo Part-Split assemblies and
                      clears local edits in this browser.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetSeeds}>Reset Registry</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Loading State */}
          {assemblies === null ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[58px] w-full bg-[#E2E8F0]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* Empty / Filtered-Empty State */
            <div className="px-6 py-12 text-center">
              <p className="font-display text-[17px] font-semibold text-[#0F1722]">
                No assemblies match{" "}
                {searchQuery.trim()
                  ? `"${searchQuery.trim()}"`
                  : statusFilter === "pass"
                    ? "Arm-Verified (Passed)"
                    : "Collision Flagged (Failed)"}
              </p>
              <p className="mt-1.5 text-[14px] text-[#455468]">
                Clear active filters or generate a new part-split 3D object in the Lux3D Foundry.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchQuery("");
                    router.replace("/", { scroll: false });
                  }}
                  className="btn-machined-secondary min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold"
                >
                  Reset Filters
                </button>
                <Link
                  href="/foundry"
                  className="btn-machined-primary inline-flex items-center min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold"
                >
                  Open Lux3D Foundry
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Semantic Specification Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#F4F7FA]">
                    <TableRow className="border-b border-[#C4CFD9] hover:bg-transparent">
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5">
                        Assembly & Dimensions
                      </TableHead>
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5">
                        Lux3D Lineage
                      </TableHead>
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5">
                        Kinematic Joint & Travel
                      </TableHead>
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5">
                        Arm Reach
                      </TableHead>
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5">
                        Clearance Verdict
                      </TableHead>
                      <TableHead className="text-[12px] font-semibold text-[#455468] px-4 py-2.5 text-right">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => {
                      const isSelected = activeAssembly?.id === item.id;
                      const isPass = item.lastRun?.status === "pass";
                      const isFail = item.lastRun?.status === "fail";
                      const sparkWidth =
                        item.joint.type === "prismatic"
                          ? Math.min(100, Math.round((item.joint.maxLimit / 0.35) * 100))
                          : Math.min(100, Math.round((item.joint.maxLimit / 130) * 100));

                      return (
                        <TableRow
                          key={item.id}
                          onClick={() => handleSelectRow(item.id)}
                          className={cn(
                            "cursor-pointer border-b border-[#C4CFD9] last:border-b-0 transition-colors",
                            isSelected ? "bg-[#EDF3FF]" : "hover:bg-[#F2F6FF]"
                          )}
                        >
                          <TableCell
                            className={cn(
                              "px-4 py-3.5",
                              isSelected && "shadow-[inset_4px_0_0_#1D4ED8]"
                            )}
                          >
                            <div className="font-semibold text-[14px] text-[#0F1722]">
                              {item.name}
                            </div>
                            <div className="font-data text-[12px] text-[#455468] mt-0.5">
                              {item.parts.length} split links · {item.dimensions[0].toFixed(2)} ×{" "}
                              {item.dimensions[1].toFixed(2)} × {item.dimensions[2].toFixed(2)} m
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3.5">
                            <span className="inline-flex items-center px-2 py-1 rounded-[4px] bg-[#E2E8F0] border border-[#C4CFD9] font-data text-[12px] text-[#455468]">
                              {item.lineageLabel}
                            </span>
                            {item.lux3dMeta?.splitTaskId && (
                              <div className="font-data text-[11px] text-[#55657A] mt-1">
                                Task #{item.lux3dMeta.splitTaskId} ·{" "}
                                {item.lux3dMeta.totalTriangles.toLocaleString()} tris
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3.5">
                            <div className="font-data text-[13px] text-[#0F1722]">
                              {item.joint.type === "prismatic"
                                ? `Prismatic ${item.joint.axisSign > 0 ? "+" : "-"}${item.joint.axis} · ${item.joint.minLimit.toFixed(2)}..${item.joint.maxLimit.toFixed(2)} m`
                                : `Revolute ${item.joint.axisSign > 0 ? "+" : "-"}${item.joint.axis} · ${Math.round(item.joint.minLimit)}°..${Math.round(item.joint.maxLimit)}°`}
                            </div>
                            <div className="w-24 h-1.5 rounded-[3px] bg-[#E2E8F0] mt-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-[3px]",
                                  isFail ? "bg-[#DC2626]" : "bg-[#1D4ED8]"
                                )}
                                style={{ width: `${Math.max(12, sparkWidth)}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 font-data text-[13px] text-[#0F1722]">
                            {item.lastRun ? `${item.lastRun.maxReachPct}% / 0.85 m` : "Pending"}
                          </TableCell>
                          <TableCell className="px-4 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border font-data text-[12px] font-semibold",
                                isPass && "bg-[#ECFDF5] text-[#065F46] border-[#6EE7B7]",
                                isFail && "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]",
                                !isPass &&
                                  !isFail &&
                                  "bg-[#FFFBEB] text-[#92400E] border-[#FCD34D]"
                              )}
                            >
                              {isPass ? (
                                <CheckCircle size={14} weight="fill" aria-hidden="true" />
                              ) : (
                                <WarningCircle size={14} weight="fill" aria-hidden="true" />
                              )}
                              {isPass
                                ? `PASS · +${item.lastRun?.minClearanceMm} mm`
                                : isFail
                                  ? `FAIL · ${item.lastRun?.minClearanceMm} mm`
                                  : "Uncalibrated"}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 text-right">
                            <Link
                              href={`/bench/${item.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "inline-flex items-center justify-center min-h-[34px] px-3 rounded-[6px] text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]",
                                isFail ? "btn-machined-primary" : "btn-machined-secondary"
                              )}
                            >
                              {isFail ? "Fix Joint" : "Calibrate"}
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Stacked Ledger */}
              <div className="md:hidden divide-y divide-[#C4CFD9]">
                {filtered.map((item) => {
                  const isSelected = activeAssembly?.id === item.id;
                  const isPass = item.lastRun?.status === "pass";
                  const isFail = item.lastRun?.status === "fail";
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectRow(item.id)}
                      className={cn(
                        "p-4 flex flex-col gap-2.5 cursor-pointer",
                        isSelected && "bg-[#EDF3FF] shadow-[inset_4px_0_0_#1D4ED8]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[14px] text-[#0F1722]">{item.name}</div>
                          <div className="font-data text-[12px] text-[#455468] mt-0.5">
                            {item.joint.type === "prismatic"
                              ? `Prismatic ${item.joint.axis} · ${item.joint.maxLimit.toFixed(2)} m`
                              : `Revolute ${item.joint.axis} · ${Math.round(item.joint.maxLimit)}°`}{" "}
                            · {item.parts.length} links
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border font-data text-[11px] font-semibold shrink-0",
                            isPass && "bg-[#ECFDF5] text-[#065F46] border-[#6EE7B7]",
                            isFail && "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]",
                            !isPass && !isFail && "bg-[#FFFBEB] text-[#92400E] border-[#FCD34D]"
                          )}
                        >
                          {isPass
                            ? `PASS · +${item.lastRun?.minClearanceMm} mm`
                            : isFail
                              ? `FAIL · ${item.lastRun?.minClearanceMm} mm`
                              : "Uncalibrated"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-[4px] bg-[#E2E8F0] border border-[#C4CFD9] font-data text-[11px] text-[#455468]">
                          {item.lineageLabel}
                        </span>
                        <Link
                          href={`/bench/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "inline-flex items-center justify-center min-h-[44px] px-4 rounded-[6px] text-[13px] font-semibold",
                            isFail ? "btn-machined-primary" : "btn-machined-secondary"
                          )}
                        >
                          {isFail ? "Fix Joint" : "Calibrate"}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </motion.section>
      </main>
    </>
  );
}
