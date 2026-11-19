"use client";

import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ARM_MAX_REACH,
  axisVector,
  solve3DofArmIK,
  transformPointByJoint,
} from "@/lib/kinematics";
import { loadGlbBlob } from "@/lib/assembly-store";
import type { AssemblyRecord, MeshPartSpec } from "@/lib/types";
import { CalibrationStage2D } from "@/components/calibration-stage-2d";

export type CameraPreset = "iso" | "side" | "top";

interface BenchViewport3DProps {
  assembly: AssemblyRecord;
  progress: number; // 0..1
  highlightMoving: boolean;
  cameraPreset: CameraPreset;
  cameraNonce: number;
  onTogglePartRole: (meshName: string) => void;
}

class WebGLErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function CameraRig({ preset, nonce }: { preset: CameraPreset; nonce: number }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0.92, 0.68, 1.18));

  useEffect(() => {
    if (preset === "iso") targetPos.current.set(0.92, 0.68, 1.18);
    else if (preset === "side") targetPos.current.set(1.42, 0.34, 0.25);
    else if (preset === "top") targetPos.current.set(0.02, 1.65, 0.32);
    camera.position.copy(targetPos.current);
    camera.lookAt(0, 0.02, 0.22);
  }, [preset, nonce, camera]);

  return null;
}

function LinkSegment({
  start,
  end,
  radius,
  color,
}: {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  color: string;
}) {
  const { mid, length, quat } = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(0.001, dir.length());
    const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    return { mid: midpoint, length: len, quat: q };
  }, [start, end]);

  return (
    <mesh position={mid} quaternion={quat} castShadow>
      <cylinderGeometry args={[radius, radius * 1.12, length, 20]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.32} />
    </mesh>
  );
}

function RobotArm3D({
  assembly,
  progress,
}: {
  assembly: AssemblyRecord;
  progress: number;
}) {
  const { joint, lastRun } = assembly;
  const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * progress;
  const handlePos = transformPointByJoint(joint.graspHandle, joint, q);
  const pose = solve3DofArmIK(joint.armBaseOffset, handlePos);
  const isFail = !pose.reachable || lastRun?.status === "fail";

  const floorY = -assembly.dimensions[1] / 2;

  // Reach ring on calibration floor
  const reachRingPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push([
        pose.base[0] + Math.cos(a) * ARM_MAX_REACH,
        floorY + 0.004,
        pose.base[2] + Math.sin(a) * ARM_MAX_REACH,
      ]);
    }
    return pts;
  }, [pose.base, floorY]);

  return (
    <group>
      {/* Workspace Reach Boundary Ring */}
      <Line
        points={reachRingPoints}
        color="#334155"
        lineWidth={1.2}
        dashed
        dashSize={0.04}
        gapSize={0.03}
      />

      {/* Industrial Pedestal Base */}
      <mesh position={[pose.base[0], floorY + 0.03, pose.base[2]]} castShadow receiveShadow>
        <cylinderGeometry args={[0.075, 0.095, 0.06, 28]} />
        <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh
        position={[pose.base[0], (floorY + 0.06 + pose.shoulder[1]) / 2, pose.base[2]]}
        castShadow
      >
        <cylinderGeometry
          args={[0.042, 0.052, Math.max(0.04, pose.shoulder[1] - (floorY + 0.06)), 24]}
        />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Shoulder Servo Collar */}
      <mesh position={pose.shoulder} castShadow>
        <sphereGeometry args={[0.042, 24, 24]} />
        <meshStandardMaterial color="#1D4ED8" metalness={0.45} roughness={0.28} />
      </mesh>

      {/* Upper Arm Link 1 */}
      <LinkSegment start={pose.shoulder} end={pose.elbow} radius={0.024} color="#E2E8F0" />

      {/* Elbow Servo Collar */}
      <mesh position={pose.elbow} castShadow>
        <sphereGeometry args={[0.034, 24, 24]} />
        <meshStandardMaterial color="#2563EB" metalness={0.45} roughness={0.28} />
      </mesh>

      {/* Forearm Link 2 */}
      <LinkSegment start={pose.elbow} end={pose.ee} radius={0.017} color="#93C5FD" />

      {/* Parallel Gripper End-Effector */}
      <group position={pose.ee}>
        <mesh castShadow>
          <sphereGeometry args={[0.02, 18, 18]} />
          <meshStandardMaterial
            color={isFail ? "#EF4444" : "#10B981"}
            emissive={isFail ? "#991B1B" : "#065F46"}
            emissiveIntensity={0.45}
            metalness={0.35}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[-0.018, 0, -0.014]}>
          <boxGeometry args={[0.008, 0.012, 0.032]} />
          <meshStandardMaterial color="#CBD5E1" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0.018, 0, -0.014]}>
          <boxGeometry args={[0.008, 0.012, 0.032]} />
          <meshStandardMaterial color="#CBD5E1" metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function SweptEnvelopeAndGizmo({
  assembly,
  progress,
}: {
  assembly: AssemblyRecord;
  progress: number;
}) {
  const { joint, parts, lastRun } = assembly;
  const isFail = lastRun?.status === "fail";

  const trajectoryPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * t;
      pts.push(transformPointByJoint(joint.graspHandle, joint, q));
    }
    return pts;
  }, [joint]);

  const currentHandle = useMemo(() => {
    const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * progress;
    return transformPointByJoint(joint.graspHandle, joint, q);
  }, [joint, progress]);

  // Compute approximate swept AABB of moving parts across full range
  const sweptBox = useMemo(() => {
    const moving = parts.filter((p) => p.role === "moving");
    if (moving.length === 0) return null;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const samples = [0, 0.25, 0.5, 0.75, 1];

    for (const part of moving) {
      const corners: [number, number, number][] = [
        [part.min[0], part.min[1], part.min[2]],
        [part.max[0], part.min[1], part.min[2]],
        [part.min[0], part.max[1], part.min[2]],
        [part.max[0], part.max[1], part.min[2]],
        [part.min[0], part.min[1], part.max[2]],
        [part.max[0], part.min[1], part.max[2]],
        [part.min[0], part.max[1], part.max[2]],
        [part.max[0], part.max[1], part.max[2]],
      ];
      for (const t of samples) {
        const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * t;
        for (const c of corners) {
          const tp = transformPointByJoint(c, joint, q);
          for (let k = 0; k < 3; k++) {
            if (tp[k] < min[k]) min[k] = tp[k];
            if (tp[k] > max[k]) max[k] = tp[k];
          }
        }
      }
    }

    return {
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ] as [number, number, number],
      size: [
        Math.max(0.03, max[0] - min[0]),
        Math.max(0.03, max[1] - min[1]),
        Math.max(0.03, max[2] - min[2]),
      ] as [number, number, number],
    };
  }, [parts, joint]);

  const [px, py, pz] = joint.pivot;
  const [ax, ay, az] = axisVector(joint.axis, joint.axisSign);

  return (
    <group>
      {/* Trajectory Breadcrumb Arc */}
      <Line points={trajectoryPoints} color="#F59E0B" lineWidth={2.2} />

      {/* Grasp Handle Amber Target Sphere */}
      <mesh position={currentHandle}>
        <sphereGeometry args={[0.022, 18, 18]} />
        <meshStandardMaterial
          color="#F59E0B"
          emissive="#D97706"
          emissiveIntensity={0.6}
          roughness={0.25}
        />
      </mesh>

      {/* Joint Pivot Origin & Signed Axis Vector */}
      <group position={[px, py, pz]}>
        <mesh>
          <sphereGeometry args={[0.015, 16, 16]} />
          <meshStandardMaterial color="#F8FAFC" emissive="#3B82F6" emissiveIntensity={0.5} />
        </mesh>
        <Line points={[[0, 0, 0], [0.14, 0, 0]]} color="#EF4444" lineWidth={2} />
        <Line points={[[0, 0, 0], [0, 0.14, 0]]} color="#22C55E" lineWidth={2} />
        <Line points={[[0, 0, 0], [0, 0, 0.14]]} color="#3B82F6" lineWidth={2} />
        <Line
          points={[
            [0, 0, 0],
            [ax * 0.24, ay * 0.24, az * 0.24],
          ]}
          color="#60A5FA"
          lineWidth={3.5}
        />
      </group>

      {/* Translucent Swept Clearance Bounding Envelope */}
      {sweptBox && (
        <mesh position={sweptBox.center}>
          <boxGeometry args={sweptBox.size} />
          <meshStandardMaterial
            color={isFail ? "#EF4444" : "#10B981"}
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function ArticulatedGlbModel({
  assembly,
  progress,
  highlightMoving,
  onTogglePartRole,
  onLoaded,
}: {
  assembly: AssemblyRecord;
  progress: number;
  highlightMoving: boolean;
  onTogglePartRole: (meshName: string) => void;
  onLoaded: (status: "loaded" | "error") => void;
}) {
  const [loadedRoot, setLoadedRoot] = useState<THREE.Group | null>(null);
  const movingPivotRef = useRef<THREE.Group>(null);

  const partRoleMap = useMemo(() => {
    const map = new Map<string, MeshPartSpec["role"]>();
    assembly.parts.forEach((p) => map.set(p.meshName, p.role));
    return map;
  }, [assembly.parts]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const loader = new GLTFLoader();

    async function load() {
      try {
        let srcUrl = assembly.splitGlbUrl;
        if (assembly.localBlobKey) {
          const buf = await loadGlbBlob(assembly.localBlobKey);
          if (buf) {
            objectUrl = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
            srcUrl = objectUrl;
          }
        } else if (srcUrl.startsWith("http")) {
          srcUrl = `/api/lux3d/fetch-glb?url=${encodeURIComponent(srcUrl)}`;
        }

        const gltf = await loader.loadAsync(srcUrl);
        if (!active) return;

        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        setLoadedRoot(gltf.scene);
        onLoaded("loaded");
      } catch {
        if (active) onLoaded("error");
      }
    }

    load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assembly.splitGlbUrl, assembly.localBlobKey, onLoaded]);

  // Separate cloned meshes cleanly into static base group vs articulated moving group
  const { baseGroup, movingGroup } = useMemo(() => {
    const bGroup = new THREE.Group();
    const mGroup = new THREE.Group();
    if (!loadedRoot) return { baseGroup: bGroup, movingGroup: mGroup };

    loadedRoot.updateMatrixWorld(true);
    let idx = 0;

    loadedRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const srcMesh = obj as THREE.Mesh;
        const name = srcMesh.name || srcMesh.parent?.name || `part_${idx}`;
        idx++;
        const role = partRoleMap.get(name) ?? "base";

        const clone = srcMesh.clone();
        clone.userData = { meshName: name, role };

        // Apply world transform directly to cloned mesh so separating parents preserves exact position
        const mat = srcMesh.matrixWorld.clone();
        clone.matrixAutoUpdate = true;
        mat.decompose(clone.position, clone.quaternion, clone.scale);

        if (role === "moving" && highlightMoving) {
          const origMat = Array.isArray(srcMesh.material) ? srcMesh.material[0] : srcMesh.material;
          if (origMat && "clone" in origMat) {
            const tinted = (origMat as THREE.MeshStandardMaterial).clone();
            if ("emissive" in tinted) {
              tinted.emissive = new THREE.Color("#1D4ED8");
              tinted.emissiveIntensity = 0.24;
            }
            clone.material = tinted;
          }
        }

        if (role === "moving") {
          // Shift into pivot-local frame so rotating/translating pivot moves the sub-mesh cleanly
          clone.position.x -= assembly.joint.pivot[0];
          clone.position.y -= assembly.joint.pivot[1];
          clone.position.z -= assembly.joint.pivot[2];
          mGroup.add(clone);
        } else {
          bGroup.add(clone);
        }
      }
    });

    return { baseGroup: bGroup, movingGroup: mGroup };
  }, [loadedRoot, partRoleMap, highlightMoving, assembly.joint.pivot]);

  // Drive live prismatic translation or revolute rotation every frame cleanly
  useFrame(() => {
    if (!movingPivotRef.current) return;
    const { joint } = assembly;
    const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * progress;
    const [px, py, pz] = joint.pivot;

    movingPivotRef.current.position.set(px, py, pz);
    movingPivotRef.current.rotation.set(0, 0, 0);

    if (joint.type === "prismatic") {
      const d = q * joint.axisSign;
      if (joint.axis === "X") movingPivotRef.current.position.x += d;
      else if (joint.axis === "Y") movingPivotRef.current.position.y += d;
      else movingPivotRef.current.position.z += d;
    } else {
      const rad = ((q * Math.PI) / 180) * joint.axisSign;
      if (joint.axis === "X") movingPivotRef.current.rotation.x = rad;
      else if (joint.axis === "Y") movingPivotRef.current.rotation.y = rad;
      else movingPivotRef.current.rotation.z = rad;
    }
  });

  if (!loadedRoot) return null;

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        const name = e.object?.userData?.meshName as string | undefined;
        if (name) onTogglePartRole(name);
      }}
    >
      <primitive object={baseGroup} />
      <group ref={movingPivotRef} position={assembly.joint.pivot}>
        <primitive object={movingGroup} />
      </group>
    </group>
  );
}

export function BenchViewport3D({
  assembly,
  progress,
  highlightMoving,
  cameraPreset,
  cameraNonce,
  onTogglePartRole,
}: BenchViewport3DProps) {
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "error">("loading");
  const floorY = -assembly.dimensions[1] / 2;

  const fallback2D = (
    <CalibrationStage2D assembly={assembly} progress={progress} showOpenButton={false} />
  );

  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[470px]">
      {loadStatus === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="hud-capsule px-3.5 py-2 font-data text-[12px] text-[#CBD5E1]">
            Loading Aholo Lux3D Part-Split GLB...
          </div>
        </div>
      )}

      {loadStatus === "error" ? (
        fallback2D
      ) : (
        <WebGLErrorBoundary fallback={fallback2D}>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0.92, 0.68, 1.18], fov: 38, near: 0.02, far: 25 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            className="w-full h-full rounded-[10px]"
          >
            <color attach="background" args={["#0E141D"]} />
            <fog attach="fog" args={["#0E141D", 4.5, 11]} />

            {/* Studio Three-Point Calibration Lighting */}
            <ambientLight intensity={0.75} />
            <directionalLight
              position={[2.2, 3.4, 2.6]}
              intensity={1.7}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <directionalLight position={[-2.4, 1.8, -1.5]} intensity={0.65} color="#93C5FD" />
            <pointLight position={[0, 1.2, 1.0]} intensity={0.45} color="#F8FAFC" />

            <CameraRig preset={cameraPreset} nonce={cameraNonce} />

            {/* Precision Calibration Floor Grid & Contact Shadows */}
            <Grid
              position={[0, floorY - 0.002, 0.2]}
              args={[6, 6]}
              cellSize={0.1}
              cellThickness={0.5}
              cellColor="#1E293B"
              sectionSize={0.5}
              sectionThickness={1}
              sectionColor="#334155"
              fadeDistance={5.5}
              infiniteGrid
            />
            <ContactShadows
              position={[0, floorY - 0.001, 0.1]}
              opacity={0.45}
              scale={2.8}
              blur={2}
              far={1.4}
            />

            {/* Real Lux3D Part-Split Articulated GLB */}
            <ArticulatedGlbModel
              assembly={assembly}
              progress={progress}
              highlightMoving={highlightMoving}
              onTogglePartRole={onTogglePartRole}
              onLoaded={(s) => setLoadStatus(s)}
            />

            {/* Swept Envelope, Trajectory Arc, Pivot Triad & Handle */}
            <SweptEnvelopeAndGizmo assembly={assembly} progress={progress} />

            {/* Real-Time 3-DOF Articulated Manipulator */}
            <RobotArm3D assembly={assembly} progress={progress} />

            <OrbitControls
              makeDefault
              target={[0, 0.02, 0.22]}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.45}
              maxDistance={3.2}
              maxPolarAngle={Math.PI / 2 - 0.03}
            />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </div>
  );
}
