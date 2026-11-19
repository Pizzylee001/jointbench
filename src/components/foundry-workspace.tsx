"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  CloudArrowUp,
  Cpu,
  Cube,
  Key,
  Lightning,
  Play,
  SlidersHorizontal,
  SpinnerGap,
  Stack,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/app-header";
import { FoundryComparator } from "@/components/foundry-comparator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadAssemblies, saveGlbBlob, upsertAssembly } from "@/lib/assembly-store";
import { parseGlbBuffer } from "@/lib/glb-parser";
import { runArmCalibrationTest } from "@/lib/kinematics";
import type { AssemblyRecord, JointConfig, MeshPartSpec } from "@/lib/types";

type PipelineStage = "idle" | "generating" | "raw-ready" | "splitting" | "split-ready" | "archiving" | "archived";

interface ActiveJobState {
  stage: PipelineStage;
  prompt: string;
  version: "G1-Turbo" | "G1";
  rawTaskId: number | null;
  rawStatus: string | null;
  rawGlbUrl: string | null;
  rawExpiresAt: number | null;
  splitTaskId: number | null;
  splitStatus: string | null;
  splitGlbUrl: string | null;
  splitExpiresAt: number | null;
  articulateTaskId: number | null;
  articulateStatus: string | null;
  error: string | null;
}

const PROMPT_PRESETS = [
  {
    label: "Lab Tool Drawer",
    prompt:
      "Compact industrial laboratory steel tool cabinet with a single front pull-out drawer and matte black bar handle, clean studio lighting, closed neutral pose",
    defaultType: "prismatic" as const,
  },
  {
    label: "Electrical Panel Box",
    prompt:
      "Wall-mounted brushed aluminum industrial electrical junction box with a side-hinged front access door and recessed latch handle, closed neutral pose",
    defaultType: "revolute" as const,
  },
  {
    label: "Countertop Toaster Oven",
    prompt:
      "Modern stainless steel countertop toaster oven with a front drop-down glass door and horizontal steel grab bar handle, closed neutral pose",
    defaultType: "revolute" as const,
  },
];

function inferJointFromParts(
  parts: MeshPartSpec[],
  dimensions: [number, number, number],
  preferredType: "prismatic" | "revolute" = "prismatic"
): JointConfig {
  const moving = parts.find((p) => p.role === "moving") ?? parts[0];
  const [w, h, d] = dimensions;
  const maxDim = Math.max(w, h, d, 0.25);

  const handlePos: [number, number, number] = moving
    ? [
        Number(moving.center[0].toFixed(3)),
        Number(moving.center[1].toFixed(3)),
        Number(moving.max[2].toFixed(3)),
      ]
    : [0, Number((h * 0.5).toFixed(3)), Number((d * 0.5).toFixed(3))];

  const pivot: [number, number, number] =
    preferredType === "revolute" && moving
      ? [
          Number(moving.min[0].toFixed(3)),
          Number(moving.center[1].toFixed(3)),
          Number(moving.min[2].toFixed(3)),
        ]
      : [0, Number((moving?.center[1] ?? h * 0.5).toFixed(3)), 0];

  return {
    type: preferredType,
    axis: preferredType === "prismatic" ? "Z" : "Y",
    axisSign: 1,
    pivot,
    minLimit: 0,
    maxLimit: preferredType === "prismatic" ? Number(Math.min(0.32, Math.max(0.14, d * 0.55)).toFixed(2)) : 90,
    graspHandle: handlePos,
    armBaseOffset: [0, Number((h * 0.2).toFixed(3)), Number((maxDim * 0.85 + 0.25).toFixed(3))],
  };
}

function formatCountdown(expiresAt: number | null, nowMs: number): string {
  if (!expiresAt) return "N/A";
  const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  if (diffSec === 0) return "Expired";
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function FoundryWorkspace() {
  const router = useRouter();
  const [assemblies, setAssemblies] = useState<AssemblyRecord[]>(() => loadAssemblies());
  const [selectedInspectId, setSelectedInspectId] = useState<string>(
    () => loadAssemblies()[0]?.id ?? "lux3d-bedside-cabinet"
  );

  // Server API key status + optional session-only BYO key
  const [serverKeyConfigured, setServerKeyConfigured] = useState<boolean | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [sessionKey, setSessionKey] = useState("");

  // Generator form state
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0].prompt);
  const [preferredJointType, setPreferredJointType] = useState<"prismatic" | "revolute">("prismatic");
  const [version, setVersion] = useState<"G1-Turbo" | "G1">("G1-Turbo");
  const [style, setStyle] = useState<string>("photorealistic");
  const [faceCount, setFaceCount] = useState<number>(60000);

  // Live pipeline job state
  const [job, setJob] = useState<ActiveJobState>({
    stage: "idle",
    prompt: "",
    version: "G1-Turbo",
    rawTaskId: null,
    rawStatus: null,
    rawGlbUrl: null,
    rawExpiresAt: null,
    splitTaskId: null,
    splitStatus: null,
    splitGlbUrl: null,
    splitExpiresAt: null,
    articulateTaskId: null,
    articulateStatus: null,
    error: null,
  });

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    state: "idle" | "parsing" | "error";
    message?: string;
  }>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live countdown ticker
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("jointbench_session_aholo_key") : null;
    if (stored) setSessionKey(stored);

    fetch("/api/lux3d/status")
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        setServerKeyConfigured(Boolean(data.configured));
      })
      .catch(() => setServerKeyConfigured(false));
  }, []);

  useEffect(() => {
    if (!job.rawExpiresAt && !job.splitExpiresAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job.rawExpiresAt, job.splitExpiresAt]);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionKey.trim()) {
      h["x-aholo-api-key"] = sessionKey.trim();
    }
    return h;
  }, [sessionKey]);

  // Polling loop for active generate / part-split tasks
  useEffect(() => {
    const activeTaskId =
      job.stage === "generating"
        ? job.rawTaskId
        : job.stage === "splitting"
          ? job.splitTaskId
          : null;

    if (!activeTaskId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/lux3d/task/${activeTaskId}`, {
          headers: sessionKey.trim() ? { "x-aholo-api-key": sessionKey.trim() } : undefined,
        });
        const data = (await res.json()) as {
          status?: string;
          glbUrl?: string | null;
          expiresAt?: number | null;
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok) {
          setJob((prev) => ({
            ...prev,
            stage: prev.stage === "splitting" ? "raw-ready" : "idle",
            error: data.error ?? "Failed to query Lux3D task status.",
          }));
          return;
        }

        if (job.stage === "generating") {
          if (data.status === "succeeded" && data.glbUrl) {
            setJob((prev) => ({
              ...prev,
              stage: "raw-ready",
              rawStatus: "succeeded",
              rawGlbUrl: data.glbUrl ?? null,
              rawExpiresAt: data.expiresAt ?? Date.now() + 2 * 60 * 60 * 1000,
              error: null,
            }));
          } else if (data.status === "failed") {
            setJob((prev) => ({
              ...prev,
              stage: "idle",
              rawStatus: "failed",
              error: "Aholo Lux3D generation task failed. Try adjusting the prompt and retrying.",
            }));
          } else {
            setJob((prev) => ({ ...prev, rawStatus: data.status ?? "running" }));
          }
        } else if (job.stage === "splitting") {
          if (data.status === "succeeded" && data.glbUrl) {
            setJob((prev) => ({
              ...prev,
              stage: "split-ready",
              splitStatus: "succeeded",
              splitGlbUrl: data.glbUrl ?? null,
              splitExpiresAt: data.expiresAt ?? Date.now() + 2 * 60 * 60 * 1000,
              error: null,
            }));
          } else if (data.status === "failed") {
            setJob((prev) => ({
              ...prev,
              stage: "raw-ready",
              splitStatus: "failed",
              error: "Aholo Lux3D Part-Split failed on this mesh. You can still archive the raw GLB or retry.",
            }));
          } else {
            setJob((prev) => ({ ...prev, splitStatus: data.status ?? "running" }));
          }
        }
      } catch {
        if (!cancelled) {
          setJob((prev) => ({ ...prev, error: "Network error polling Lux3D task status." }));
        }
      }
    };

    const interval = window.setInterval(poll, 3200);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [job.stage, job.rawTaskId, job.splitTaskId, sessionKey]);

  const handleQueueGenerate = async () => {
    setJob({
      stage: "generating",
      prompt: prompt.trim(),
      version,
      rawTaskId: null,
      rawStatus: "queued",
      rawGlbUrl: null,
      rawExpiresAt: null,
      splitTaskId: null,
      splitStatus: null,
      splitGlbUrl: null,
      splitExpiresAt: null,
      articulateTaskId: null,
      articulateStatus: null,
      error: null,
    });

    try {
      const res = await fetch("/api/lux3d/generate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          prompt: prompt.trim(),
          version,
          style,
          faceCount,
          enablePbr: true,
        }),
      });
      const data = (await res.json()) as { taskId?: number; error?: string };
      if (!res.ok || !data.taskId) {
        setJob((prev) => ({
          ...prev,
          stage: "idle",
          error: data.error ?? "Failed to queue Lux3D text-to-3D generation.",
        }));
        return;
      }
      setJob((prev) => ({
        ...prev,
        rawTaskId: data.taskId ?? null,
        rawStatus: "queued",
      }));
    } catch {
      setJob((prev) => ({
        ...prev,
        stage: "idle",
        error: "Unable to reach /api/lux3d/generate.",
      }));
    }
  };

  const handleQueuePartSplit = async () => {
    if (!job.rawGlbUrl) return;
    setJob((prev) => ({
      ...prev,
      stage: "splitting",
      splitStatus: "queued",
      error: null,
    }));

    try {
      const res = await fetch("/api/lux3d/part-split", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ glbUrl: job.rawGlbUrl }),
      });
      const data = (await res.json()) as { taskId?: number; error?: string };
      if (!res.ok || !data.taskId) {
        setJob((prev) => ({
          ...prev,
          stage: "raw-ready",
          error: data.error ?? "Failed to queue Lux3D Part-Split.",
        }));
        return;
      }
      setJob((prev) => ({
        ...prev,
        splitTaskId: data.taskId ?? null,
        splitStatus: "queued",
      }));
    } catch {
      setJob((prev) => ({
        ...prev,
        stage: "raw-ready",
        error: "Unable to reach /api/lux3d/part-split.",
      }));
    }
  };

  const handleQueueArticulate = async () => {
    const targetUrl = job.splitGlbUrl ?? job.rawGlbUrl;
    if (!targetUrl) return;
    try {
      const res = await fetch("/api/lux3d/articulate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          glbUrl: targetUrl,
          prompt: `Articulate moving component smoothly: ${job.prompt || prompt}`,
        }),
      });
      const data = (await res.json()) as { taskId?: number; error?: string };
      if (!res.ok || !data.taskId) {
        setJob((prev) => ({ ...prev, error: data.error ?? "Articulation request failed." }));
        return;
      }
      setJob((prev) => ({
        ...prev,
        articulateTaskId: data.taskId ?? null,
        articulateStatus: "queued",
      }));
    } catch {
      setJob((prev) => ({ ...prev, error: "Unable to reach /api/lux3d/articulate." }));
    }
  };

  const handleArchiveLiveJob = async () => {
    const targetUrl = job.splitGlbUrl ?? job.rawGlbUrl;
    if (!targetUrl) return;

    setJob((prev) => ({ ...prev, stage: "archiving", error: null }));
    try {
      const proxyRes = await fetch(`/api/lux3d/fetch-glb?url=${encodeURIComponent(targetUrl)}`);
      if (!proxyRes.ok) {
        throw new Error("Could not download temporary Lux3D GLB via server proxy.");
      }
      const buffer = await proxyRes.arrayBuffer();
      const parsed = parseGlbBuffer(buffer);
      const id = `lux3d-live-${job.splitTaskId ?? job.rawTaskId ?? Date.now()}`;
      const blobKey = `glb_${id}`;
      await saveGlbBlob(blobKey, buffer);

      const cleanTitle =
        (job.prompt || prompt)
          .split(/[,.]/)[0]
          .trim()
          .slice(0, 42) || "Lux3D Assembly";

      const joint = inferJointFromParts(parsed.parts, parsed.dimensions, preferredJointType);

      const record: AssemblyRecord = {
        id,
        name: cleanTitle,
        description: `Generated via Aholo Lux3D ${job.version}${job.splitTaskId ? " and split into independent links via Part-Split" : ""}. Archived locally to IndexedDB.`,
        source: "lux3d-live",
        lineageLabel: `Lux3D ${job.version} Live Archive`,
        lux3dMeta: {
          version: job.version,
          rawTaskId: job.rawTaskId ?? undefined,
          splitTaskId: job.splitTaskId ?? undefined,
          rawMeshCount: 1,
          splitMeshCount: parsed.meshCount,
          totalTriangles: parsed.totalTriangles,
          prompt: job.prompt || prompt,
          expiresAt: null,
        },
        rawGlbUrl: job.rawGlbUrl ?? undefined,
        splitGlbUrl: targetUrl,
        localBlobKey: blobKey,
        dimensions: parsed.dimensions,
        parts: parsed.parts,
        joint,
        lastRun: null,
        runHistory: [],
        updatedAt: new Date().toISOString(),
      };

      const initialRun = runArmCalibrationTest(record);
      record.lastRun = initialRun;
      record.runHistory = [initialRun];

      const updated = upsertAssembly(record);
      setAssemblies(updated);
      setJob((prev) => ({ ...prev, stage: "archived" }));
      router.push(`/bench/${record.id}`);
    } catch (err) {
      setJob((prev) => ({
        ...prev,
        stage: prev.splitGlbUrl ? "split-ready" : "raw-ready",
        error: err instanceof Error ? err.message : "Failed to archive GLB locally.",
      }));
    }
  };

  const processUploadedFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setUploadStatus({
        state: "error",
        message: "Only binary glTF 2.0 (.glb) files are supported. Export GLB from Aholo 3D Studio.",
      });
      return;
    }

    setUploadStatus({ state: "parsing", message: `Parsing ${file.name}...` });
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseGlbBuffer(buffer);
      const slug = file.name
        .replace(/\.glb$/i, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .toLowerCase()
        .slice(0, 32);
      const id = `studio-${slug}-${Date.now().toString(36)}`;
      const blobKey = `glb_${id}`;
      await saveGlbBlob(blobKey, buffer);

      const displayName = file.name
        .replace(/\.glb$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const joint = inferJointFromParts(parsed.parts, parsed.dimensions, preferredJointType);

      const record: AssemblyRecord = {
        id,
        name: displayName,
        description:
          parsed.meshCount >= 2
            ? `Imported local multi-part GLB (${parsed.meshCount} independent sub-meshes, ${parsed.totalTriangles.toLocaleString()} tris).`
            : `Imported monolithic GLB (1 mesh, ${parsed.totalTriangles.toLocaleString()} tris). Run Lux3D Part Split for multi-link articulation.`,
        source: "studio-upload",
        lineageLabel: "Aholo Studio / Local GLB",
        lux3dMeta: {
          version: "Local GLB",
          rawMeshCount: 1,
          splitMeshCount: parsed.meshCount,
          totalTriangles: parsed.totalTriangles,
        },
        splitGlbUrl: "",
        localBlobKey: blobKey,
        dimensions: parsed.dimensions,
        parts: parsed.parts,
        joint,
        lastRun: null,
        runHistory: [],
        updatedAt: new Date().toISOString(),
      };

      const initialRun = runArmCalibrationTest(record);
      record.lastRun = initialRun;
      record.runHistory = [initialRun];

      const updated = upsertAssembly(record);
      setAssemblies(updated);
      setUploadStatus({ state: "idle" });
      router.push(`/bench/${record.id}`);
    } catch (err) {
      setUploadStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to parse GLB binary.",
      });
    }
  };

  const inspectedAssembly = useMemo(() => {
    return (
      assemblies.find((a) => a.id === selectedInspectId) ??
      assemblies[0]
    );
  }, [assemblies, selectedInspectId]);

  const activeStepIndex = useMemo(() => {
    switch (job.stage) {
      case "idle":
        return 0;
      case "generating":
        return 1;
      case "raw-ready":
      case "splitting":
        return 2;
      case "split-ready":
      case "archiving":
      case "archived":
        return 3;
    }
  }, [job.stage]);

  const conveyorSteps = [
    { num: "01", title: "Prompt or Studio GLB", detail: "Text-to-3D spec or local file" },
    { num: "02", title: "Lux3D G1-Turbo", detail: "Generate PBR monolithic mesh" },
    { num: "03", title: "Lux3D Part Split", detail: "Separate base & moving links (1 slot)" },
    { num: "04", title: "Local Archive", detail: "Persist GLB & calibrate in Bench" },
  ];

  const keyAvailable = Boolean(serverKeyConfigured || sessionKey.trim());

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#0F1722] pb-24 md:pb-10">
      <AppHeader assemblyCount={assemblies.length} activeBenchId={inspectedAssembly?.id} />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Page Heading + API Status Bar */}
        <div className="mb-6 flex flex-col gap-4 border-b border-[#C4CFD9] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F1722] sm:text-3xl">
              Lux3D Pipeline Foundry
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#475569]">
              Generate articulated-ready 3D meshes with Aholo Lux3D G1-Turbo, split monolithic geometry into independent kinematic links, or import a Studio GLB directly into the calibration bench.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium ${
                job.stage === "splitting"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  job.stage === "splitting" ? "animate-pulse bg-amber-500" : "bg-emerald-500"
                }`}
              />
              Part-Split Slot: {job.stage === "splitting" ? "Busy (1/1)" : "Available (0/1)"}
            </span>

            <button
              type="button"
              onClick={() => setShowKeyInput((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors ${
                keyAvailable
                  ? "border-[#C4CFD9] bg-white text-[#334155] hover:bg-slate-50"
                  : "border-[#1D4ED8]/40 bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]"
              }`}
            >
              <Key className="h-3.5 w-3.5" weight="duotone" />
              {serverKeyConfigured
                ? "Server API Key Ready"
                : sessionKey.trim()
                  ? "Session API Key Active"
                  : "Configure API Key"}
            </button>
          </div>
        </div>

        {/* Optional Session-Only BYO API Key Drawer */}
        {showKeyInput && (
          <div className="mb-6 rounded-xl border border-[#C4CFD9] bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-[#0F1722]">
                  Session-Only Aholo API Key Override
                </p>
                <p className="text-xs text-[#475569]">
                  {serverKeyConfigured
                    ? "Server AHOLO_API_KEY is already active. You only need this field if testing with a different Aholo account key."
                    : "Sent via request header to our Next.js server proxy and held only in sessionStorage for this tab."}
                </p>
              </div>
              <div className="flex w-full max-w-md items-center gap-2">
                <Input
                  type="password"
                  value={sessionKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSessionKey(val);
                    if (typeof window !== "undefined") {
                      if (val.trim()) {
                        window.sessionStorage.setItem("jointbench_session_aholo_key", val.trim());
                      } else {
                        window.sessionStorage.removeItem("jointbench_session_aholo_key");
                      }
                    }
                  }}
                  placeholder="Paste Aholo Labs API Key..."
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKeyInput(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 4-Stage Pipeline Conveyor */}
        <section
          aria-label="Lux3D Pipeline Conveyor"
          className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {conveyorSteps.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            const isComplete = idx < activeStepIndex || job.stage === "archived";
            return (
              <div
                key={step.num}
                className={`relative overflow-hidden rounded-xl border p-3.5 transition-colors ${
                  isActive
                    ? "border-[#1D4ED8]/50 bg-white shadow-xs"
                    : isComplete
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-[#C4CFD9] bg-white/80"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="foundryConveyorAccent"
                    transition={{ type: "spring", stiffness: 360, damping: 32 }}
                    className="absolute inset-x-0 top-0 h-1 bg-[#1D4ED8]"
                  />
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#64748B]">
                    STAGE {step.num}
                  </span>
                  {isComplete ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600" weight="fill" />
                  ) : isActive ? (
                    <span className="h-2 w-2 rounded-full bg-[#1D4ED8]" />
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-[#0F1722]">{step.title}</p>
                <p className="mt-0.5 text-xs text-[#64748B]">{step.detail}</p>
              </div>
            );
          })}
        </section>

        {/* Main 2-Column Split: Left (API Pipeline + Local Upload) | Right (Raw vs Part-Split Proof Comparator) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN (5 cols): Live Lux3D Pipeline + Studio GLB Dropzone */}
          <div className="space-y-6 lg:col-span-5">
            {/* Live Lux3D API Composer */}
            <section className="rounded-2xl border border-[#C4CFD9] bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1D4ED8]">
                    <Cpu className="h-4 w-4" weight="duotone" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#0F1722]">
                      Aholo Lux3D Live Generator
                    </h2>
                    <p className="font-mono text-[11px] text-[#64748B]">
                      POST /global/lux3d/v1/generate + part-split
                    </p>
                  </div>
                </div>
              </div>

              {/* Preset Chips */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.prompt);
                      setPreferredJointType(preset.defaultType);
                    }}
                    className="rounded-md border border-[#C4CFD9] bg-[#F4F6F9] px-2.5 py-1 text-xs font-medium text-[#334155] transition-colors hover:border-[#1D4ED8]/40 hover:bg-[#EFF6FF] hover:text-[#1D4ED8]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="lux3d-prompt" className="mb-1 block text-xs font-medium text-[#334155]">
                    Object Prompt (describe chassis + moving part clearly)
                  </label>
                  <Textarea
                    id="lux3d-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    className="resize-none border-[#C4CFD9] bg-[#F8FAFC] text-sm"
                    placeholder="Describe an articulated object with clear base and moving sub-parts..."
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="lux3d-version" className="mb-1 block font-mono text-[11px] text-[#64748B]">
                      MODEL
                    </label>
                    <select
                      id="lux3d-version"
                      value={version}
                      onChange={(e) => setVersion(e.target.value as "G1-Turbo" | "G1")}
                      className="h-9 w-full rounded-md border border-[#C4CFD9] bg-white px-2.5 font-mono text-xs text-[#0F1722]"
                    >
                      <option value="G1-Turbo">G1-Turbo</option>
                      <option value="G1">G1 High-Res</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lux3d-style" className="mb-1 block font-mono text-[11px] text-[#64748B]">
                      STYLE
                    </label>
                    <select
                      id="lux3d-style"
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className="h-9 w-full rounded-md border border-[#C4CFD9] bg-white px-2.5 font-mono text-xs text-[#0F1722]"
                    >
                      <option value="photorealistic">photorealistic</option>
                      <option value="hand_painted">hand_painted</option>
                      <option value="glass">glass</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lux3d-faces" className="mb-1 block font-mono text-[11px] text-[#64748B]">
                      FACES
                    </label>
                    <select
                      id="lux3d-faces"
                      value={faceCount}
                      onChange={(e) => setFaceCount(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-[#C4CFD9] bg-white px-2.5 font-mono text-xs text-[#0F1722]"
                    >
                      <option value={30000}>30,000</option>
                      <option value={60000}>60,000</option>
                      <option value={100000}>100,000</option>
                    </select>
                  </div>
                </div>

                {/* Error Alert */}
                {job.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
                    <span>{job.error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={handleQueueGenerate}
                    disabled={
                      job.stage === "generating" ||
                      job.stage === "splitting" ||
                      job.stage === "archiving" ||
                      prompt.trim().length < 4
                    }
                    className="flex-1 bg-[#1D4ED8] text-white hover:bg-[#1E40AF]"
                  >
                    {job.stage === "generating" ? (
                      <>
                        <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />
                        Generating Mesh...
                      </>
                    ) : (
                      <>
                        <Lightning className="mr-2 h-4 w-4" weight="fill" />
                        Generate Raw GLB
                      </>
                    )}
                  </Button>
                </div>

                {/* Live Task Telemetry Card */}
                {(job.rawTaskId || job.splitTaskId) && (
                  <div className="mt-3 space-y-2.5 rounded-xl border border-[#C4CFD9] bg-[#F4F6F9] p-3.5">
                    {job.rawTaskId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[#475569]">
                          Raw Task #{job.rawTaskId}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono font-semibold uppercase text-[#0F1722]">
                          {job.rawStatus === "succeeded" ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                          ) : (
                            <SpinnerGap className="h-3.5 w-3.5 animate-spin text-[#1D4ED8]" />
                          )}
                          {job.rawStatus}
                        </span>
                      </div>
                    )}

                    {job.rawExpiresAt && (
                      <div className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 font-mono text-[11px] text-[#475569] ring-1 ring-[#C4CFD9]">
                        <span className="inline-flex items-center gap-1">
                          <ClockCountdown className="h-3.5 w-3.5 text-amber-600" />
                          CDN URL TTL
                        </span>
                        <span className="font-semibold text-[#0F1722]">
                          {formatCountdown(job.splitExpiresAt ?? job.rawExpiresAt, nowMs)}
                        </span>
                      </div>
                    )}

                    {job.splitTaskId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[#475569]">
                          Part-Split Task #{job.splitTaskId}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono font-semibold uppercase text-[#0F1722]">
                          {job.splitStatus === "succeeded" ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                          ) : (
                            <SpinnerGap className="h-3.5 w-3.5 animate-spin text-[#1D4ED8]" />
                          )}
                          {job.splitStatus}
                        </span>
                      </div>
                    )}

                    {job.articulateTaskId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[#475569]">
                          Articulation Task #{job.articulateTaskId}
                        </span>
                        <span className="font-mono font-semibold uppercase text-[#334155]">
                          {job.articulateStatus}
                        </span>
                      </div>
                    )}

                    {/* Stage 3 & 4 Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {job.rawGlbUrl && !job.splitGlbUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleQueuePartSplit}
                          disabled={job.stage === "splitting" || job.stage === "archiving"}
                          className="flex-1 border-[#C4CFD9] bg-white font-mono text-xs"
                        >
                          {job.stage === "splitting" ? (
                            <>
                              <SpinnerGap className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Splitting Links...
                            </>
                          ) : (
                            <>
                              <Stack className="mr-1.5 h-3.5 w-3.5" />
                              Run Part Split
                            </>
                          )}
                        </Button>
                      )}

                      {(job.splitGlbUrl || job.rawGlbUrl) && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleArchiveLiveJob}
                          disabled={job.stage === "archiving" || job.stage === "splitting"}
                          className="flex-1 bg-[#0F1722] font-mono text-xs text-white hover:bg-slate-800"
                        >
                          {job.stage === "archiving" ? (
                            <>
                              <SpinnerGap className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Archiving...
                            </>
                          ) : (
                            <>
                              Archive &amp; Open Bench
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {job.splitGlbUrl && !job.articulateTaskId && (
                      <button
                        type="button"
                        onClick={handleQueueArticulate}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#C4CFD9] py-1.5 font-mono text-[11px] text-[#475569] transition-colors hover:border-[#1D4ED8] hover:bg-white hover:text-[#1D4ED8]"
                      >
                        <Play className="h-3 w-3" weight="fill" />
                        Optional: Queue Lux3D Articulation Preview
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Local Studio GLB Upload Dropzone */}
            <section className="rounded-2xl border border-[#C4CFD9] bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#334155]">
                  <CloudArrowUp className="h-4 w-4" weight="duotone" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#0F1722]">
                    Import Local Studio GLB
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Instant in-browser sub-mesh parser &amp; IndexedDB archive
                  </p>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processUploadedFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                  dragActive
                    ? "border-[#1D4ED8] bg-[#EFF6FF]"
                    : "border-[#C4CFD9] bg-[#F8FAFC] hover:border-[#64748B] hover:bg-[#F4F6F9]"
                }`}
              >
                <UploadSimple className="h-7 w-7 text-[#64748B]" weight="duotone" />
                <p className="mt-2 text-sm font-medium text-[#0F1722]">
                  Drop a `.glb` from Aholo 3D Studio or click to browse
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                  Reads binary glTF 2.0 vertex bounds &amp; sub-meshes client-side
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processUploadedFile(file);
                  }}
                />
              </div>

              {uploadStatus.state === "parsing" && (
                <p className="mt-2.5 flex items-center gap-2 font-mono text-xs text-[#475569]">
                  <SpinnerGap className="h-3.5 w-3.5 animate-spin text-[#1D4ED8]" />
                  {uploadStatus.message}
                </p>
              )}
              {uploadStatus.state === "error" && (
                <p className="mt-2.5 flex items-center gap-2 text-xs text-red-700">
                  <WarningCircle className="h-4 w-4 shrink-0" weight="fill" />
                  {uploadStatus.message}
                </p>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN (7 cols): Real Aholo Lux3D Raw vs Part-Split Proof Comparator */}
          <div className="lg:col-span-7">
            <section className="rounded-2xl border border-[#C4CFD9] bg-white p-5 shadow-xs">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[#0F1722]">
                    Raw Monolith vs. Lux3D Part-Split Inspector
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Drag the amber curtain to compare the raw G1-Turbo mesh against its separated kinematic links.
                  </p>
                </div>

                {inspectedAssembly && (
                  <Button asChild size="sm" className="bg-[#0F1722] text-white hover:bg-slate-800">
                    <Link href={`/bench/${inspectedAssembly.id}`}>
                      <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                      Open in Bench
                    </Link>
                  </Button>
                )}
              </div>

              {/* Assembly Selector Tabs */}
              <div className="mb-4 flex flex-wrap gap-2">
                {assemblies.map((item) => {
                  const selected = inspectedAssembly?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedInspectId(item.id)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                        selected
                          ? "border-[#0F1722] bg-[#0F1722] text-white"
                          : "border-[#C4CFD9] bg-[#F8FAFC] text-[#334155] hover:bg-[#F1F5F9]"
                      }`}
                    >
                      <Cube className="h-3.5 w-3.5 shrink-0" weight="duotone" />
                      <span className="font-medium">{item.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          selected
                            ? "bg-white/15 text-slate-100"
                            : "bg-white text-[#475569] ring-1 ring-[#C4CFD9]"
                        }`}
                      >
                        1 -&gt; {item.parts.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {inspectedAssembly && (
                <FoundryComparator
                  key={inspectedAssembly.id}
                  assembly={inspectedAssembly}
                />
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
