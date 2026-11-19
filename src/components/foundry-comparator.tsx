"use client";

import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Cube,
  ArrowsOutLineHorizontal,
  Stack,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { loadGlbBlob } from "@/lib/assembly-store";
import type { AssemblyRecord } from "@/lib/types";

const BASE_COLORS = ["#64748b", "#475569", "#94a3b8", "#334155"];
const MOVING_COLORS = ["#2563eb", "#f59e0b", "#0ea5e9", "#10b981"];

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

function normalizeAndCenter(root: THREE.Group): {
  scale: number;
  center: THREE.Vector3;
} {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 0.82 / maxDim;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  return { scale, center };
}

function RawGlbScene({
  url,
  localBlobKey,
  sharedYawRef,
}: {
  url: string;
  localBlobKey?: string;
  sharedYawRef: React.MutableRefObject<number>;
}) {
  const [sceneObj, setSceneObj] = useState<THREE.Group | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let active = true;
    let blobUrl: string | null = null;
    const loader = new GLTFLoader();

    async function load() {
      try {
        let src = url;
        if (!src && localBlobKey) {
          const buf = await loadGlbBlob(localBlobKey);
          if (buf) {
            blobUrl = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
            src = blobUrl;
          }
        } else if (src.startsWith("http")) {
          src = `/api/lux3d/fetch-glb?url=${encodeURIComponent(src)}`;
        }
        if (!src) return;

        const gltf = await loader.loadAsync(src);
        if (!active) return;

        const root = gltf.scene.clone(true);
        normalizeAndCenter(root);

        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.material = new THREE.MeshStandardMaterial({
              color: "#94a3b8",
              roughness: 0.48,
              metalness: 0.16,
            });
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        setSceneObj(root);
      } catch {
        // Fallback handled gracefully by empty scene
      }
    }

    load();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, localBlobKey]);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = sharedYawRef.current;
    }
  });

  if (!sceneObj) return null;
  return (
    <group ref={groupRef}>
      <primitive object={sceneObj} />
    </group>
  );
}

function SplitGlbScene({
  url,
  localBlobKey,
  exploded,
  assembly,
  sharedYawRef,
}: {
  url: string;
  localBlobKey?: string;
  exploded: boolean;
  assembly: AssemblyRecord;
  sharedYawRef: React.MutableRefObject<number>;
}) {
  const [loadedData, setLoadedData] = useState<{
    root: THREE.Group;
    records: Array<{
      mesh: THREE.Mesh;
      basePos: THREE.Vector3;
      explodeDir: THREE.Vector3;
    }>;
  } | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  const partRoleMap = useMemo(() => {
    const map = new Map<string, "base" | "moving">();
    for (const p of assembly.parts) {
      map.set(p.meshName, p.role);
    }
    return map;
  }, [assembly.parts]);

  useEffect(() => {
    let active = true;
    let blobUrl: string | null = null;
    const loader = new GLTFLoader();

    async function load() {
      try {
        let src = url;
        if (localBlobKey) {
          const buf = await loadGlbBlob(localBlobKey);
          if (buf) {
            blobUrl = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
            src = blobUrl;
          }
        } else if (src.startsWith("http")) {
          src = `/api/lux3d/fetch-glb?url=${encodeURIComponent(src)}`;
        }
        if (!src) return;

        const gltf = await loader.loadAsync(src);
        if (!active) return;

        const root = gltf.scene.clone(true);
        const { center } = normalizeAndCenter(root);

        const records: Array<{
          mesh: THREE.Mesh;
          basePos: THREE.Vector3;
          explodeDir: THREE.Vector3;
        }> = [];

        let idx = 0;
        let movingCount = 0;
        let baseCount = 0;

        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const candidateName = mesh.name || mesh.parent?.name || "";
            const indexedName = `part_${idx}`;
            const resolvedName = partRoleMap.has(candidateName)
              ? candidateName
              : partRoleMap.has(indexedName)
                ? indexedName
                : assembly.parts[idx]?.meshName ?? indexedName;
            const role = partRoleMap.get(resolvedName) ?? (idx === 0 ? "base" : "moving");

            const mBox = new THREE.Box3().setFromObject(mesh);
            const mCenter = new THREE.Vector3();
            mBox.getCenter(mCenter);

            const colorHex =
              role === "moving"
                ? MOVING_COLORS[movingCount++ % MOVING_COLORS.length]
                : BASE_COLORS[baseCount++ % BASE_COLORS.length];

            mesh.material = new THREE.MeshStandardMaterial({
              color: colorHex,
              roughness: 0.38,
              metalness: 0.2,
              emissive: role === "moving" ? colorHex : "#000000",
              emissiveIntensity: role === "moving" ? 0.16 : 0,
            });
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const dir = mCenter.clone().sub(center);
            if (dir.lengthSq() < 0.0005) {
              dir.set(0, role === "moving" ? 0.45 : -0.1, role === "moving" ? 0.85 : -0.2);
            }
            dir.normalize();
            if (role === "base") {
              dir.multiplyScalar(0.25);
            }

            records.push({
              mesh,
              basePos: mesh.position.clone(),
              explodeDir: dir,
            });
            idx++;
          }
        });

        setLoadedData({ root, records });
      } catch {
        // Handled cleanly
      }
    }

    load();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, localBlobKey, partRoleMap, assembly.parts]);

  useFrame((_, delta) => {
    sharedYawRef.current += delta * 0.22;
    if (groupRef.current) {
      groupRef.current.rotation.y = sharedYawRef.current;
    }
    if (loadedData) {
      const targetAmt = exploded ? 0.14 : 0;
      for (const rec of loadedData.records) {
        const target = rec.basePos.clone().addScaledVector(rec.explodeDir, targetAmt);
        rec.mesh.position.lerp(target, Math.min(1, delta * 9));
      }
    }
  });

  if (!loadedData) return null;
  return (
    <group ref={groupRef}>
      <primitive object={loadedData.root} />
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

        <g clipPath={`inset(0 ${100 - curtainPct}% 0 0)`}>
          <rect x="210" y="90" width="220" height="160" rx="10" fill="#64748b" fillOpacity="0.45" stroke="#94a3b8" strokeWidth="2" />
          <text x="320" y="176" textAnchor="middle" fill="#cbd5e1" fontSize="13" fontFamily="monospace">
            RAW MONOLITH ({rawCount} MESH)
          </text>
        </g>

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
  const sharedYawRef = useRef(-0.42);
  const webglReady = React.useSyncExternalStore(
    subscribeWebgl,
    getWebglClientSnapshot,
    getWebglServerSnapshot
  );

  const rawUrl = overrideRawUrl ?? assembly.rawGlbUrl ?? assembly.splitGlbUrl;
  const splitUrl = overrideSplitUrl ?? assembly.splitGlbUrl;

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
                camera={{ position: [1.35, 0.72, 1.55], fov: 36 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
              >
                <color attach="background" args={["#0b111b"]} />
                <ambientLight intensity={0.85} />
                <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow />
                <directionalLight position={[-3, 3, -3]} intensity={0.65} color="#93c5fd" />
                <Grid
                  position={[0, -0.45, 0]}
                  args={[6, 6]}
                  cellSize={0.2}
                  cellColor="#1e293b"
                  sectionSize={1}
                  sectionColor="#334155"
                  fadeDistance={6}
                />
                <ContactShadows position={[0, -0.448, 0]} opacity={0.45} scale={3} blur={2} />
                <SplitGlbScene
                  url={splitUrl}
                  localBlobKey={assembly.localBlobKey}
                  exploded={exploded}
                  assembly={assembly}
                  sharedYawRef={sharedYawRef}
                />
                <OrbitControls enablePan={false} target={[0, 0, 0]} minDistance={1.1} maxDistance={3.2} />
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
                camera={{ position: [1.35, 0.72, 1.55], fov: 36 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
              >
                <color attach="background" args={["#111827"]} />
                <ambientLight intensity={0.95} />
                <directionalLight position={[4, 6, 4]} intensity={1.4} />
                <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#e2e8f0" />
                <Grid
                  position={[0, -0.45, 0]}
                  args={[6, 6]}
                  cellSize={0.2}
                  cellColor="#1f2937"
                  sectionSize={1}
                  sectionColor="#374151"
                  fadeDistance={6}
                />
                <RawGlbScene
                  url={rawUrl}
                  localBlobKey={assembly.localBlobKey}
                  sharedYawRef={sharedYawRef}
                />
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
