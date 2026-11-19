"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  Check,
  CheckCircle,
  Code,
  Copy,
  Cube,
  DownloadSimple,
  Eye,
  Play,
  SlidersHorizontal,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { CalibrationStage2D } from "@/components/calibration-stage-2d";
import type { CameraPreset } from "@/components/bench-viewport-3d";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  loadAssemblies,
  resolveAssemblyGlbBuffer,
  upsertAssembly,
} from "@/lib/assembly-store";
import { runArmCalibrationTest, solve3DofArmIK, transformPointByJoint } from "@/lib/kinematics";
import { exportAssemblyUrdfZip, generateUrdfXml } from "@/lib/urdf-export";
import type { AssemblyRecord, JointAxis, JointType } from "@/lib/types";
import { cn } from "@/lib/utils";

const BenchViewport3D = dynamic(
  () => import("@/components/bench-viewport-3d").then((m) => m.BenchViewport3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[360px] flex items-center justify-center">
        <div className="hud-capsule px-3.5 py-2 font-data text-[12px] text-[#CBD5E1]">
          Initializing 3D Calibration Bay...
        </div>
      </div>
    ),
  }
);

interface BenchWorkspaceProps {
  assemblyId: string;
}

export function BenchWorkspace({ assemblyId }: BenchWorkspaceProps) {
  const router = useRouter();
  const prefersReduced = useReducedMotion();

  const [allAssemblies, setAllAssemblies] = useState<AssemblyRecord[]>([]);
  const [assembly, setAssembly] = useState<AssemblyRecord | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [progress, setProgress] = useState(0.58);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [highlightMoving, setHighlightMoving] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("iso");
  const [cameraNonce, setCameraNonce] = useState(0);
  const [scanNonce, setScanNonce] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [copiedXml, setCopiedXml] = useState(false);

  const sweepRafRef = useRef<number | null>(null);

  useEffect(() => {
    const list = loadAssemblies();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllAssemblies(list);
    const match = list.find((a) => a.id === assemblyId);
    if (match) {
      setAssembly(match);
      setNotFound(false);
    } else if (list.length > 0 && assemblyId === "default") {
      setAssembly(list[0]);
      setNotFound(false);
    } else {
      setAssembly(null);
      setNotFound(true);
    }
  }, [assemblyId]);

  useEffect(() => {
    return () => {
      if (sweepRafRef.current) cancelAnimationFrame(sweepRafRef.current);
    };
  }, []);

  const persistAssembly = useCallback((next: AssemblyRecord) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setAssembly(updated);
    const nextList = upsertAssembly(updated);
    setAllAssemblies(nextList);
  }, []);

  const updateAndEvaluate = useCallback(
    (updater: (curr: AssemblyRecord) => AssemblyRecord, recordHistory = false) => {
      if (!assembly) return;
      const mutated = updater(assembly);
      const report = runArmCalibrationTest(mutated);
      const next: AssemblyRecord = {
        ...mutated,
        lastRun: report,
        runHistory: recordHistory
          ? [report, ...mutated.runHistory].slice(0, 8)
          : mutated.runHistory,
      };
      persistAssembly(next);
    },
    [assembly, persistAssembly]
  );

  const handleTogglePartRole = useCallback(
    (meshName: string) => {
      updateAndEvaluate((curr) => ({
        ...curr,
        parts: curr.parts.map((p) =>
          p.meshName === meshName
            ? { ...p, role: p.role === "moving" ? "base" : "moving" }
            : p
        ),
      }));
    },
    [updateAndEvaluate]
  );

  const handleSetJointType = (type: JointType) => {
    updateAndEvaluate((curr) => ({
      ...curr,
      joint: {
        ...curr.joint,
        type,
        minLimit: 0,
        maxLimit: type === "prismatic" ? 0.24 : 90,
      },
    }));
  };

  const handleSetAxis = (axis: JointAxis) => {
    updateAndEvaluate((curr) => ({
      ...curr,
      joint: { ...curr.joint, axis },
    }));
  };

  const handleFlipSign = () => {
    updateAndEvaluate((curr) => ({
      ...curr,
      joint: { ...curr.joint, axisSign: curr.joint.axisSign === 1 ? -1 : 1 },
    }));
  };

  const handleLimitChange = (field: "minLimit" | "maxLimit", value: string) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    updateAndEvaluate((curr) => ({
      ...curr,
      joint: { ...curr.joint, [field]: num },
    }));
  };

  const handlePivotChange = (axisIdx: 0 | 1 | 2, value: string) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    updateAndEvaluate((curr) => {
      const nextPivot: [number, number, number] = [...curr.joint.pivot];
      nextPivot[axisIdx] = num;
      return {
        ...curr,
        joint: { ...curr.joint, pivot: nextPivot },
      };
    });
  };

  const handleApplySafeLimit = () => {
    if (!assembly) return;
    const safeMax =
      assembly.joint.type === "revolute"
        ? 92
        : Number(Math.max(0.16, assembly.dimensions[2] * 0.62).toFixed(2));
    updateAndEvaluate(
      (curr) => ({
        ...curr,
        joint: { ...curr.joint, minLimit: 0, maxLimit: safeMax },
      }),
      true
    );
    setScanNonce((n) => n + 1);
  };

  const handleRunArmTest = () => {
    if (!assembly) return;
    setScanNonce((n) => n + 1);
    updateAndEvaluate((curr) => curr, true);

    if (prefersReduced) {
      setProgress(1);
      return;
    }

    if (sweepRafRef.current) cancelAnimationFrame(sweepRafRef.current);
    setIsSweeping(true);
    const startTime = performance.now();
    const duration = 1150;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Smooth ease-in-out sweep 0 -> 1
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setProgress(eased);
      if (t < 1) {
        sweepRafRef.current = requestAnimationFrame(tick);
      } else {
        setIsSweeping(false);
        sweepRafRef.current = null;
      }
    };
    sweepRafRef.current = requestAnimationFrame(tick);
  };

  const handleRestoreRun = (runIdx: number) => {
    if (!assembly) return;
    const target = assembly.runHistory[runIdx];
    if (!target) return;
    updateAndEvaluate((curr) => ({
      ...curr,
      joint: {
        ...curr.joint,
        type: target.jointSnapshot.type,
        axis: target.jointSnapshot.axis,
        axisSign: target.jointSnapshot.axisSign,
        minLimit: target.jointSnapshot.minLimit,
        maxLimit: target.jointSnapshot.maxLimit,
      },
    }));
    setScanNonce((n) => n + 1);
  };

  const handleExportZip = async () => {
    if (!assembly) return;
    setIsExporting(true);
    setExportMessage(null);
    try {
      const { filename, blob } = await exportAssemblyUrdfZip(assembly, resolveAssemblyGlbBuffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`Exported ${filename} (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`);
    } catch {
      setExportMessage("Export failed. Verify the GLB asset is available and retry.");
    } finally {
      setIsExporting(false);
    }
  };

  const urdfXml = useMemo(() => (assembly ? generateUrdfXml(assembly) : ""), [assembly]);

  const handleCopyXml = async () => {
    if (!urdfXml) return;
    try {
      await navigator.clipboard.writeText(urdfXml);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 1800);
    } catch {
      // Ignore clipboard failure in headless contexts
    }
  };

  const liveTelemetry = useMemo(() => {
    if (!assembly) return null;
    const { joint, lastRun } = assembly;
    const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * progress;
    const handlePos = transformPointByJoint(joint.graspHandle, joint, q);
    const pose = solve3DofArmIK(joint.armBaseOffset, handlePos);
    const unit = joint.type === "prismatic" ? "m" : "°";
    const qFormatted = joint.type === "prismatic" ? `${q.toFixed(2)} ${unit}` : `${Math.round(q)}${unit}`;
    return {
      q,
      qFormatted,
      reachPct: lastRun?.maxReachPct ?? pose.reachPct,
      clearanceMm: lastRun?.minClearanceMm ?? 0,
      isPass: lastRun?.status === "pass",
      isFail: lastRun?.status === "fail",
      invalidLimits: joint.minLimit >= joint.maxLimit,
    };
  }, [assembly, progress]);

  if (notFound) {
    return (
      <>
        <AppHeader assemblyCount={allAssemblies.length} />
        <main className="max-w-[720px] mx-auto px-4 py-16 text-center">
          <div className="instrument-plate p-8">
            <h1 className="font-display text-[24px] font-bold text-[#0F1722]">
              Assembly not found in Registry
            </h1>
            <p className="mt-2 text-[14px] text-[#455468]">
              This assembly ID is not archived in your local JointBench store. Select an archived
              Lux3D split or generate a new one in the Foundry.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/"
                className="btn-machined-primary inline-flex items-center min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold"
              >
                Back to Registry
              </Link>
              <Link
                href="/foundry"
                className="btn-machined-secondary inline-flex items-center min-h-[40px] px-4 rounded-[6px] text-[13px] font-semibold"
              >
                Open Lux3D Foundry
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!assembly || !liveTelemetry) {
    return (
      <>
        <AppHeader assemblyCount={allAssemblies.length} />
        <main className="w-full p-4 grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_332px] gap-3">
          <Skeleton className="h-[480px] bg-[#E2E8F0]" />
          <Skeleton className="h-[540px] bg-[#18202B]" />
          <Skeleton className="h-[480px] bg-[#E2E8F0]" />
        </main>
      </>
    );
  }

  const movingCount = assembly.parts.filter((p) => p.role === "moving").length;

  return (
    <>
      <AppHeader assemblyCount={allAssemblies.length} activeBenchId={assembly.id} />

      <main className="w-full px-3 lg:px-4 py-3 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)_336px] gap-3 min-h-[calc(100dvh-86px)]">
          {/* LEFT RAIL (Desktop 1, Mobile 3): Split Part Hierarchy + Run History */}
          <aside className="instrument-plate p-3.5 flex flex-col gap-3.5 order-3 lg:order-1">
            <div>
              <label htmlFor="assembly-switcher" className="block text-[11px] font-semibold text-[#455468] mb-1.5">
                Active Assembly
              </label>
              <select
                id="assembly-switcher"
                value={assembly.id}
                onChange={(e) => router.push(`/bench/${e.target.value}`)}
                className="w-full min-h-[38px] px-2.5 rounded-[6px] border border-[#8FA0B3] bg-white text-[13px] font-semibold text-[#0F1722] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                {allAssemblies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.lastRun?.status.toUpperCase() ?? "NEW"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-[#C4CFD9]">
              <h2 className="font-display text-[15px] font-bold text-[#0F1722]">
                Split Parts ({assembly.parts.length})
              </h2>
              <span className="font-data text-[11px] text-[#455468]">Click to bind</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {assembly.parts.map((part) => {
                const isMoving = part.role === "moving";
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => handleTogglePartRole(part.meshName)}
                    className={cn(
                      "w-full min-h-[42px] px-2.5 py-2 rounded-[6px] border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]",
                      isMoving
                        ? "border-[#1D4ED8] bg-[#EDF3FF]"
                        : "border-[#C4CFD9] bg-[#F1F5F9] hover:border-[#8FA0B3]"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-data text-[12px] font-semibold text-[#0F1722] truncate">
                        {part.label}
                      </div>
                      <div className="font-data text-[10px] text-[#55657A]">
                        {part.meshName} · {part.triangles.toLocaleString()} tris
                      </div>
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-[4px] text-[11px] font-semibold shrink-0",
                        isMoving
                          ? "bg-[#1D4ED8] text-white"
                          : "bg-[#E2E8F0] text-[#455468]"
                      )}
                    >
                      {isMoving ? "Moving" : "Base"}
                    </span>
                  </button>
                );
              })}
            </div>

            {movingCount === 0 && (
              <p className="text-[12px] text-[#991B1B] bg-[#FEF2F2] border border-[#FCA5A5] rounded-[6px] px-2.5 py-2">
                Select at least one sub-mesh as Moving to articulate this joint.
              </p>
            )}

            <div className="mt-auto pt-3 border-t border-[#C4CFD9]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-[13px] font-bold text-[#0F1722]">
                  Saved Calibration Runs
                </h3>
                <span className="font-data text-[11px] text-[#455468]">
                  {assembly.runHistory.length}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto">
                {assembly.runHistory.map((run, idx) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => handleRestoreRun(idx)}
                    className="w-full px-2.5 py-2 rounded-[6px] border border-[#C4CFD9] bg-white hover:border-[#1D4ED8] flex items-center justify-between text-left transition-colors cursor-pointer"
                  >
                    <span className="font-data text-[11px] text-[#455468]">
                      #{assembly.runHistory.length - idx} (
                      {run.jointSnapshot.type === "prismatic"
                        ? `${run.jointSnapshot.maxLimit.toFixed(2)} m`
                        : `${Math.round(run.jointSnapshot.maxLimit)}°`}
                      )
                    </span>
                    <span
                      className={cn(
                        "font-data text-[11px] font-bold",
                        run.status === "pass" ? "text-[#065F46]" : "text-[#991B1B]"
                      )}
                    >
                      {run.status.toUpperCase()} · {run.minClearanceMm >= 0 ? "+" : ""}
                      {run.minClearanceMm} mm
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* CENTER DOMINANT STAGE (Desktop 2, Mobile 1): 3D Calibration Chamber */}
          <section
            className="calibration-chamber relative overflow-hidden p-3.5 flex flex-col justify-between gap-2.5 order-1 lg:order-2 min-h-[480px] lg:min-h-[600px]"
            aria-label="3D Kinematic Calibration Chamber"
          >
            <div
              key={scanNonce}
              className={cn("chamber-laser z-20", scanNonce > 0 && "chamber-laser-active")}
              aria-hidden="true"
            />

            {/* Top Viewport HUD */}
            <div className="relative z-20 flex flex-wrap items-start justify-between gap-2">
              <div className="hud-capsule px-3 py-2">
                <h1 className="font-display text-[16px] font-bold text-[#F8FAFC] leading-tight">
                  {assembly.name}
                </h1>
                <div className="font-data text-[12px] text-[#94A3B8] mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  <span className="whitespace-nowrap">
                    q = <span className="text-[#60A5FA]">{liveTelemetry.qFormatted}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    Reach <span className="text-[#F1F5F9]">{liveTelemetry.reachPct}%</span>
                  </span>
                  <span className="whitespace-nowrap">
                    Clearance{" "}
                    <span
                      className={liveTelemetry.isFail ? "text-[#F87171]" : "text-[#34D399]"}
                    >
                      {liveTelemetry.clearanceMm >= 0 ? "+" : ""}
                      {liveTelemetry.clearanceMm} mm
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="hud-capsule p-1 inline-flex gap-1">
                  {(["iso", "side", "top"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCameraPreset(preset);
                        setCameraNonce((n) => n + 1);
                      }}
                      className={cn(
                        "px-2 py-1 rounded-[4px] font-data text-[11px] uppercase cursor-pointer transition-colors",
                        cameraPreset === preset && viewMode === "3d"
                          ? "bg-[#1D4ED8] text-white"
                          : "text-[#CBD5E1] hover:text-white"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setHighlightMoving((v) => !v)}
                  className={cn(
                    "hud-capsule px-2.5 py-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer",
                    highlightMoving ? "text-[#93C5FD]" : "text-[#94A3B8]"
                  )}
                  title="Highlight moving sub-mesh in blue"
                >
                  <Eye size={13} aria-hidden="true" />
                  Tint Moving
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode((m) => (m === "3d" ? "2d" : "3d"))}
                  className="hud-capsule px-2.5 py-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#CBD5E1] hover:text-white cursor-pointer"
                >
                  <Cube size={13} aria-hidden="true" />
                  {viewMode === "3d" ? "2D Ortho" : "3D WebGL"}
                </button>

                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border font-data text-[12px] font-semibold whitespace-nowrap",
                    liveTelemetry.isPass
                      ? "bg-[#ECFDF5] text-[#065F46] border-[#6EE7B7]"
                      : "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]"
                  )}
                >
                  {liveTelemetry.isPass ? (
                    <CheckCircle size={14} weight="fill" aria-hidden="true" />
                  ) : (
                    <WarningCircle size={14} weight="fill" aria-hidden="true" />
                  )}
                  {liveTelemetry.isPass ? "PASS · CLEAR" : "FAIL · COLLISION"}
                </span>
              </div>
            </div>

            {/* Center 3D WebGL / 2D Orthographic Canvas */}
            <div className="relative z-10 flex-1 flex items-center justify-center min-h-[340px]">
              {viewMode === "3d" ? (
                <BenchViewport3D
                  assembly={assembly}
                  progress={progress}
                  highlightMoving={highlightMoving}
                  cameraPreset={cameraPreset}
                  cameraNonce={cameraNonce}
                  onTogglePartRole={handleTogglePartRole}
                />
              ) : (
                <div className="w-full">
                  <CalibrationStage2D
                    assembly={assembly}
                    progress={progress}
                    scanNonce={scanNonce}
                    showOpenButton={false}
                  />
                </div>
              )}
            </div>

            {/* Bottom Vernier Scrubber & Discrete Pose Controls */}
            <div className="relative z-20 hud-capsule p-3 flex flex-col gap-2">
              <div className="vernier-scale">
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.75)] transition-all duration-150"
                  style={{ left: `${Math.round(progress * 100)}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                  <label
                    htmlFor="joint-travel-range"
                    className="text-[12px] text-[#CBD5E1] whitespace-nowrap"
                  >
                    Joint travel
                  </label>
                  <input
                    id="joint-travel-range"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(progress * 100)}
                    onChange={(e) => setProgress(Number(e.target.value) / 100)}
                    className="flex-1 accent-[#3B82F6] cursor-pointer"
                  />
                  <span className="font-data text-[12px] text-[#F1F5F9] min-w-[56px] text-right">
                    {liveTelemetry.qFormatted}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProgress((p) => Math.max(0, Number((p - 0.15).toFixed(2))))}
                    className="btn-machined-dark min-h-[34px] px-2.5 rounded-[6px] text-[12px] font-semibold cursor-pointer"
                  >
                    - Step
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress((p) => Math.min(1, Number((p + 0.15).toFixed(2))))}
                    className="btn-machined-dark min-h-[34px] px-2.5 rounded-[6px] text-[12px] font-semibold cursor-pointer"
                  >
                    + Step
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress(0)}
                    className="btn-machined-dark min-h-[34px] px-2 rounded-[6px] font-data text-[11px] cursor-pointer"
                    title="Jump to Min Limit pose"
                  >
                    0%
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress(0.5)}
                    className="btn-machined-dark min-h-[34px] px-2 rounded-[6px] font-data text-[11px] cursor-pointer"
                    title="Jump to Mid pose"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress(1)}
                    className="btn-machined-dark min-h-[34px] px-2 rounded-[6px] font-data text-[11px] cursor-pointer"
                    title="Jump to Max Limit pose"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={handleRunArmTest}
                    disabled={isSweeping}
                    className="btn-machined-primary inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-[6px] text-[12px] font-semibold cursor-pointer disabled:opacity-60"
                  >
                    <Play size={13} weight="fill" aria-hidden="true" />
                    {isSweeping ? "Sweeping..." : "Run Arm Test"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT RAIL (Desktop 3, Mobile 2): Joint Spec & Live URDF XML Inspector */}
          <aside className="instrument-plate p-3.5 flex flex-col gap-3 order-2 lg:order-3">
            <Tabs defaultValue="spec" className="flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#C4CFD9] gap-2">
                <TabsList className="grid grid-cols-2 w-full bg-[#E2E8F0] p-[3px] h-[36px] rounded-[7px]">
                  <TabsTrigger
                    value="spec"
                    className="text-[12px] font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#0F1722] rounded-[5px]"
                  >
                    <SlidersHorizontal size={13} aria-hidden="true" />
                    Joint Spec
                  </TabsTrigger>
                  <TabsTrigger
                    value="urdf"
                    className="text-[12px] font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#0F1722] rounded-[5px]"
                  >
                    <Code size={13} aria-hidden="true" />
                    URDF XML
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="spec" className="mt-3 flex-1 flex flex-col gap-3.5">
                {/* Joint Type Spring Switch */}
                <div>
                  <span className="block text-[12px] font-semibold text-[#455468] mb-1.5">
                    Joint Type
                  </span>
                  <div className="grid grid-cols-2 p-[3px] bg-[#E2E8F0] border border-[#C4CFD9] rounded-[7px] gap-0.5">
                    {(["prismatic", "revolute"] as const).map((jt) => {
                      const active = assembly.joint.type === jt;
                      return (
                        <button
                          key={jt}
                          type="button"
                          onClick={() => handleSetJointType(jt)}
                          className={cn(
                            "relative min-h-[34px] rounded-[5px] text-[12px] font-semibold capitalize cursor-pointer transition-colors",
                            active ? "text-white" : "text-[#455468] hover:text-[#0F1722]"
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId={prefersReduced ? undefined : "bench-joint-type"}
                              transition={{ type: "spring", stiffness: 440, damping: 32 }}
                              className="absolute inset-0 bg-[#1D4ED8] rounded-[5px] z-0"
                            />
                          )}
                          <span className="relative z-10">{jt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Motion Axis Spring Switch + Sign Toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-[#455468]">Motion Axis</span>
                    <button
                      type="button"
                      onClick={handleFlipSign}
                      className="font-data text-[11px] font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
                    >
                      Dir: {assembly.joint.axisSign > 0 ? "+Positive" : "-Negative"} (Flip)
                    </button>
                  </div>
                  <div className="grid grid-cols-3 p-[3px] bg-[#E2E8F0] border border-[#C4CFD9] rounded-[7px] gap-0.5 font-data">
                    {(["X", "Y", "Z"] as const).map((ax) => {
                      const active = assembly.joint.axis === ax;
                      return (
                        <button
                          key={ax}
                          type="button"
                          onClick={() => handleSetAxis(ax)}
                          className={cn(
                            "relative min-h-[34px] rounded-[5px] text-[12px] font-semibold cursor-pointer transition-colors",
                            active ? "text-white" : "text-[#455468] hover:text-[#0F1722]"
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId={prefersReduced ? undefined : "bench-axis"}
                              transition={{ type: "spring", stiffness: 440, damping: 32 }}
                              className="absolute inset-0 bg-[#0F1722] rounded-[5px] z-0"
                            />
                          )}
                          <span className="relative z-10">
                            {assembly.joint.axisSign > 0 ? "+" : "-"}
                            {ax}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Min & Max Limits */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="min-limit-input"
                      className="block text-[12px] font-semibold text-[#455468] mb-1"
                    >
                      Min ({assembly.joint.type === "prismatic" ? "m" : "deg"})
                    </label>
                    <Input
                      id="min-limit-input"
                      type="number"
                      step={assembly.joint.type === "prismatic" ? 0.02 : 5}
                      value={assembly.joint.minLimit}
                      onChange={(e) => handleLimitChange("minLimit", e.target.value)}
                      className="font-data h-[36px] bg-white border-[#8FA0B3]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="max-limit-input"
                      className="block text-[12px] font-semibold text-[#455468] mb-1"
                    >
                      Max ({assembly.joint.type === "prismatic" ? "m" : "deg"})
                    </label>
                    <Input
                      id="max-limit-input"
                      type="number"
                      step={assembly.joint.type === "prismatic" ? 0.02 : 5}
                      value={assembly.joint.maxLimit}
                      onChange={(e) => handleLimitChange("maxLimit", e.target.value)}
                      className="font-data h-[36px] bg-white border-[#8FA0B3]"
                    />
                  </div>
                </div>
                {liveTelemetry.invalidLimits && (
                  <p className="text-[12px] text-[#991B1B] font-medium -mt-2">
                    Min Limit must be smaller than Max Limit.
                  </p>
                )}

                {/* Pivot Origin Coordinates */}
                <div>
                  <span className="block text-[12px] font-semibold text-[#455468] mb-1">
                    Joint Pivot Origin (m)
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["X", "Y", "Z"] as const).map((label, idx) => (
                      <div key={label}>
                        <label
                          htmlFor={`pivot-${label}`}
                          className="sr-only"
                        >{`Pivot ${label}`}</label>
                        <Input
                          id={`pivot-${label}`}
                          type="number"
                          step={0.01}
                          value={assembly.joint.pivot[idx as 0 | 1 | 2]}
                          onChange={(e) => handlePivotChange(idx as 0 | 1 | 2, e.target.value)}
                          className="font-data text-[12px] h-[34px] px-2 bg-white border-[#8FA0B3]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Telemetry Gauges */}
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-[#455468] font-medium">Arm Workspace Reach</span>
                      <span className="font-data font-semibold text-[#0F1722]">
                        {liveTelemetry.reachPct}% / 0.85 m
                      </span>
                    </div>
                    <div className="h-[7px] rounded-[4px] bg-[#E2E8F0] overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-[4px] transition-all duration-200",
                          liveTelemetry.reachPct > 98 ? "bg-[#DC2626]" : "bg-[#1D4ED8]"
                        )}
                        style={{ width: `${Math.min(100, liveTelemetry.reachPct)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-[#455468] font-medium">Swept Body Clearance</span>
                      <span
                        className={cn(
                          "font-data font-semibold",
                          liveTelemetry.isFail ? "text-[#991B1B]" : "text-[#065F46]"
                        )}
                      >
                        {liveTelemetry.clearanceMm >= 0 ? "+" : ""}
                        {liveTelemetry.clearanceMm} mm
                      </span>
                    </div>
                    <div className="h-[7px] rounded-[4px] bg-[#E2E8F0] overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-[4px] transition-all duration-200",
                          liveTelemetry.isFail ? "bg-[#DC2626]" : "bg-[#059669]"
                        )}
                        style={{
                          width: liveTelemetry.isFail
                            ? "18%"
                            : `${Math.min(100, Math.max(24, liveTelemetry.clearanceMm + 20))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Arm Sweep Verdict Box */}
                <div
                  className={cn(
                    "p-3 rounded-[8px] border transition-colors",
                    liveTelemetry.isPass
                      ? "bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]"
                      : "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
                  )}
                >
                  <div className="flex items-center justify-between text-[13px] font-bold">
                    <span>Arm Sweep Verdict</span>
                    <span className="font-data">
                      {assembly.lastRun?.status.toUpperCase() ?? "PENDING"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-[1.45]">
                    {assembly.lastRun?.summary}
                  </p>
                  {liveTelemetry.isFail && (
                    <button
                      type="button"
                      onClick={handleApplySafeLimit}
                      className="mt-2.5 w-full min-h-[34px] px-2.5 rounded-[6px] bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Wrench size={13} weight="bold" aria-hidden="true" />
                      Apply Recommended Safe Limit
                    </button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="urdf" className="mt-3 flex-1 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-data text-[11px] text-[#455468]">
                    ROS / MuJoCo / Isaac Sim URDF 1.0
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyXml}
                    className="btn-machined-secondary min-h-[30px] px-2.5 rounded-[5px] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedXml ? (
                      <>
                        <Check size={12} weight="bold" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} aria-hidden="true" />
                        Copy XML
                      </>
                    )}
                  </button>
                </div>
                <pre className="flex-1 max-h-[390px] overflow-auto rounded-[8px] bg-[#0E141D] text-[#E2E8F0] p-3 font-data text-[11px] leading-[1.5] border border-[#273549]">
                  <code>{urdfXml}</code>
                </pre>
              </TabsContent>
            </Tabs>

            {/* Bottom Action Dock */}
            <div className="pt-3 border-t border-[#C4CFD9] flex flex-col gap-2">
              <button
                type="button"
                onClick={handleRunArmTest}
                disabled={isSweeping}
                className="btn-machined-primary w-full min-h-[42px] rounded-[6px] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Play size={15} weight="fill" aria-hidden="true" />
                {isSweeping ? "Running 24-Waypoint Arm Sweep..." : "Run Arm Test"}
              </button>
              <button
                type="button"
                onClick={handleExportZip}
                disabled={isExporting}
                className="btn-machined-secondary w-full min-h-[42px] rounded-[6px] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <DownloadSimple size={15} weight="bold" aria-hidden="true" />
                {isExporting ? "Bundling URDF + GLB ZIP..." : "Export Sim-Ready URDF ZIP"}
              </button>
              {exportMessage && (
                <p className="font-data text-[11px] text-[#065F46] text-center">{exportMessage}</p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
