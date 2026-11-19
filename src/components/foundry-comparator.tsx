"use client";

import React, { Component, Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  Cube,
  ArrowsOutLineHorizontal,
  Stack,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AssemblyRecord } from "@/lib/types";

const PART_COLORS = [
  "#64748b", // base chassis slate
  "#2563eb", // primary moving part - calibration cobalt
  "#f59e0b", // secondary moving / clasp - signal amber
  "#15803d", // tertiary part - pass emerald
  "#0ea5e9", // auxiliary trim - cyan
  "#7c3aed", // extra part - indigo
];

interface FoundryComparatorProps {
  assembly: AssemblyRecord;
  overrideRawUrl?: string | null;
  overrideSplitUrl?: string | null;
}

class PreviewErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function RawGlbMesh({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 0.85 / maxDim;
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          color: "#94a3b8",
          roughness: 0.55,
          metalness: 0.15,
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return root;
  }, [gltf.scene]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

function SplitGlbMesh({
  url,
  exploded,
  partRoles,
}: {
  url: string;
  exploded: boolean;
  partRoles: Record<string, "base" | "moving">;
}) {
  const gltf = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  const { cloned, meshRecords } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 0.85 / maxDim;
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    const records: Array<{
      mesh: THREE.Mesh;
      basePos: THREE.Vector3;
      explodeDir: THREE.Vector3;
    }> = [];

    let colorIdx = 0;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mBox = new THREE.Box3().setFromObject(mesh);
        const mCenter = new THREE.Vector3();
        mBox.getCenter(mCenter);

        const role = partRoles[mesh.name] ?? (colorIdx === 0 ? "base" : "moving");
        const colorHex =
          role === "moving"
            ? "#2563eb"
            : PART_COLORS[colorIdx % PART_COLORS.length];

        mesh.material = new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.42,
          metalness: 0.18,
          emissive: role === "moving" ? "#1d4ed8" : "#000000",
          emissiveIntensity: role === "moving" ? 0.12 : 0,
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const dir = mCenter.clone().sub(center);
        if (dir.lengthSq() < 0.0001) {
          dir.set(0, 0.25, 0.15);
        } else {
          dir.normalize();
        }
        records.push({
          mesh,
          basePos: mesh.position.clone(),
          explodeDir: dir,
        });
        colorIdx++;
      }
    });

    return { cloned: root, meshRecords: records };
  }, [gltf.scene, partRoles]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18;
    }
    const targetAmt = exploded ? 0.14 : 0;
    for (const rec of meshRecords) {
      const target = rec.basePos.clone().addScaledVector(rec.explodeDir, targetAmt);
      rec.mesh.position.lerp(target, Math.min(1, delta * 8));
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

function SchematicComparatorFallback({
  assembly,
  curtainPct,
  exploded,
}: {
  assembly: AssemblyRecord;
  curtainPct: number;
  exploded: boolean;
}) {
  const rawCount = assembly.lux3dMeta?.rawMeshCount ?? 1;
  const splitCount = assembly.parts.length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-[#C4CFD9] bg-[#0B111B] text-slate-200">
      <svg viewBox="0 0 640 340" className="h-full w-full">
        <defs>
          <pattern id="foundryGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1e293b" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="640" height="340" fill="url(#foundryGrid)" />

        {/* Left: Raw Monolithic */}
        <g clipPath={`inset(0 ${100 - curtainPct}% 0 0)`}>
          <rect x="210" y="90" width="220" height="160" rx="10" fill="#64748b" fillOpacity="0.45" stroke="#94a3b8" strokeWidth="2" />
          <text x="320" y="176" textAnchor="middle" fill="#cbd5e1" fontSize="13" fontFamily="monospace">
            RAW MONOLITH ({rawCount} MESH)
          </text>
        </g>

        {/* Right: Part-Split */}
        <g clipPath={`inset(0 0 0 ${curtainPct}%)`}>
          {assembly.parts.map((part, i) => {
            const offset = exploded ? (i % 2 === 0 ? -10 : 14) : 0;
            const y = 92 + i * (150 / Math.max(splitCount, 1));
            const h = Math.max(18, 140 / Math.max(splitCount, 1) - 4);
            const isMoving = part.role === "moving";
            return (
              <g key={part.id} transform={`translate(${offset}, 0)`}>
                <rect
                  x="212"
                  y={y}
                  width="216"
                  height={h}
                  rx="6"
                  fill={isMoving ? "#2563EB" : "#334155"}
                  fillOpacity={isMoving ? "0.78" : "0.7"}
                  stroke={isMoving ? "#93C5FD" : "#64748b"}
                  strokeWidth="1.5"
                />
                <text x="224" y={y + h / 2 + 4} fill="#f8fafc" fontSize="11" fontFamily="monospace">
                  {part.meshName} ({part.role.toUpperCase()})
                </text>
              </g>
            );
          })}
        </g>

        <line x1={(640 * curtainPct) / 100} y1="0" x2={(640 * curtainPct) / 100} y2="340" stroke="#F59E0B" strokeWidth="2" />
      </svg>
    </div>
  );
}

function subscribeWebgl() {
  return () => {};
}

function getWebglClientSnapshot(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function getWebglServerSnapshot(): boolean {
  return true;
}

export function FoundryComparator({
  assembly,
  overrideRawUrl,
  overrideSplitUrl,
}: FoundryComparatorProps) {
  const [curtainPct, setCurtainPct] = useState(50);
  const [exploded, setExploded] = useState(true);
  const webglReady = React.useSyncExternalStore(
    subscribeWebgl,
    getWebglClientSnapshot,
    getWebglServerSnapshot
  );

  const rawUrl = overrideRawUrl ?? assembly.rawGlbUrl ?? assembly.splitGlbUrl;
  const splitUrl = overrideSplitUrl ?? assembly.splitGlbUrl;

  const partRoles = useMemo(() => {
    const map: Record<string, "base" | "moving"> = {};
    for (const p of assembly.parts) {
      map[p.meshName] = p.role;
    }
    return map;
  }, [assembly.parts]);

  const rawCount = assembly.lux3dMeta?.rawMeshCount ?? 1;
  const splitCount = assembly.parts.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#C4CFD9] bg-white px-2.5 py-1 font-mono text-xs font-medium text-[#334155]">
            <Cube className="h-3.5 w-3.5 text-[#64748B]" weight="duotone" />
            Raw: {rawCount} mesh
          </span>
          <span className="font-mono text-xs text-slate-400">-&gt;</span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#1D4ED8]/30 bg-[#EFF6FF] px-2.5 py-1 font-mono text-xs font-semibold text-[#1D4ED8]">
            <Stack className="h-3.5 w-3.5" weight="duotone" />
            Part-Split: {splitCount} independent links
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "Raw", val: 100 },
            { label: "50 / 50", val: 50 },
            { label: "Split", val: 0 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setCurtainPct(preset.val)}
              className={`rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                curtainPct === preset.val
                  ? "border-[#0F1722] bg-[#0F1722] text-white"
                  : "border-[#C4CFD9] bg-white text-[#334155] hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setExploded((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
              exploded
                ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                : "border-[#C4CFD9] bg-white text-[#334155] hover:bg-slate-50"
            }`}
          >
            <Sparkle className="h-3.5 w-3.5" weight="bold" />
            {exploded ? "Exploded" : "Assembled"}
          </button>
        </div>
      </div>

      {/* Dual-Layer Curtain Viewport */}
      <div className="relative h-[340px] w-full overflow-hidden rounded-xl border border-[#C4CFD9] bg-[#0B111B] shadow-inner select-none">
        {webglReady ? (
          <PreviewErrorBoundary
            fallback={
              <SchematicComparatorFallback
                assembly={assembly}
                curtainPct={curtainPct}
                exploded={exploded}
              />
            }
          >
            {/* Bottom Layer: Part-Split Color-Coded Exploded GLB */}
            <div className="absolute inset-0">
              <Canvas
                shadows
                dpr={[1, 1.5]}
                camera={{ position: [1.35, 1.05, 1.45], fov: 38 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
              >
                <color attach="background" args={["#0b111b"]} />
                <ambientLight intensity={0.75} />
                <directionalLight position={[4, 6, 4]} intensity={1.3} castShadow />
                <directionalLight position={[-3, 3, -3]} intensity={0.45} color="#93c5fd" />
                <Grid
                  args={[6, 6]}
                  cellSize={0.2}
                  cellColor="#1e293b"
                  sectionSize={1}
                  sectionColor="#334155"
                  fadeDistance={6}
                />
                <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={3} blur={2} />
                <Suspense fallback={null}>
                  <SplitGlbMesh url={splitUrl} exploded={exploded} partRoles={partRoles} />
                </Suspense>
                <OrbitControls enablePan={false} minDistance={0.8} maxDistance={3.2} />
              </Canvas>
            </div>

            {/* Top Clipped Layer: Raw Monolithic GLB */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - curtainPct}% 0 0)` }}
            >
              <Canvas
                shadows
                dpr={[1, 1.5]}
                camera={{ position: [1.35, 1.05, 1.45], fov: 38 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
              >
                <color attach="background" args={["#111827"]} />
                <ambientLight intensity={0.75} />
                <directionalLight position={[4, 6, 4]} intensity={1.2} />
                <Grid
                  args={[6, 6]}
                  cellSize={0.2}
                  cellColor="#1f2937"
                  sectionSize={1}
                  sectionColor="#374151"
                  fadeDistance={6}
                />
                <Suspense fallback={null}>
                  <RawGlbMesh url={rawUrl} />
                </Suspense>
              </Canvas>
            </div>
          </PreviewErrorBoundary>
        ) : (
          <SchematicComparatorFallback
            assembly={assembly}
            curtainPct={curtainPct}
            exploded={exploded}
          />
        )}

        {/* Vertical Split Curtain Line + Handle */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#F59E0B] shadow-[0_0_12px_rgba(245,158,11,0.75)]"
          style={{ left: `${curtainPct}%` }}
        >
          <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#F59E0B] text-[#0F1722] shadow-md">
            <ArrowsOutLineHorizontal className="h-4 w-4" weight="bold" />
          </div>
        </div>

        {/* Corner Badges */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-md bg-slate-900/85 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-200 backdrop-blur-sm">
          RAW MONOLITH ({rawCount} MESH)
          {assembly.lux3dMeta?.rawTaskId ? ` · #${assembly.lux3dMeta.rawTaskId}` : ""}
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-md bg-[#1D4ED8]/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur-sm">
          LUX3D PART SPLIT ({splitCount} LINKS)
          {assembly.lux3dMeta?.splitTaskId ? ` · #${assembly.lux3dMeta.splitTaskId}` : ""}
        </div>

        {/* Range Input Overlay for Dragging Curtain */}
        <div className="absolute inset-x-4 bottom-3 z-20 flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 backdrop-blur-sm">
          <span className="font-mono text-[11px] text-slate-400">CURTAIN</span>
          <input
            type="range"
            min={0}
            max={100}
            value={curtainPct}
            aria-label="Raw versus part-split comparison curtain"
            onChange={(e) => setCurtainPct(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[#F59E0B]"
          />
          <span className="w-10 text-right font-mono text-xs font-semibold text-white">
            {curtainPct}%
          </span>
        </div>
      </div>

      {/* Exact Sub-Mesh Breakdown Table */}
      <div className="overflow-x-auto rounded-lg border border-[#C4CFD9] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#C4CFD9] bg-[#F4F6F9] font-mono text-[11px] uppercase tracking-wider text-[#475569]">
              <th className="px-3 py-2">Sub-Mesh</th>
              <th className="px-3 py-2">Semantic Role</th>
              <th className="px-3 py-2 text-right">Triangles</th>
              <th className="px-3 py-2 text-right">Bounds (W x H x D mm)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assembly.parts.map((part) => (
              <tr key={part.id} className="hover:bg-[#F8FAFC]">
                <td className="px-3 py-2 font-mono font-medium text-[#0F1722]">
                  {part.meshName}
                  <span className="ml-2 text-[#64748B]">({part.label})</span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                      part.role === "moving"
                        ? "bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#1D4ED8]/30"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {part.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#334155]">
                  {part.triangles.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#475569]">
                  {Math.round(part.size[0] * 1000)} x {Math.round(part.size[1] * 1000)} x{" "}
                  {Math.round(part.size[2] * 1000)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!webglReady && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WarningCircle className="h-4 w-4 shrink-0" weight="fill" />
          WebGL context unavailable in this browser; displaying schematic layer comparison fallback.
        </div>
      )}
    </div>
  );
}
