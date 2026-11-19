export type JointType = "prismatic" | "revolute";
export type JointAxis = "X" | "Y" | "Z";
export type PartRole = "base" | "moving";
export type VerdictStatus = "pass" | "fail" | "uncalibrated";

export interface MeshPartSpec {
  id: string;
  meshName: string;
  label: string;
  triangles: number;
  role: PartRole;
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
}

export interface JointConfig {
  type: JointType;
  axis: JointAxis;
  axisSign: 1 | -1;
  pivot: [number, number, number];
  minLimit: number; // meters for prismatic, degrees for revolute
  maxLimit: number; // meters for prismatic, degrees for revolute
  graspHandle: [number, number, number];
  armBaseOffset: [number, number, number]; // position of 3-DOF robot arm pedestal relative to object origin
}

export interface ArmWaypointSample {
  t: number; // 0..1
  q: number; // current joint coordinate (m or deg)
  handlePos: [number, number, number];
  shoulderAngle: number;
  elbowAngle: number;
  yawAngle: number;
  reachMeters: number;
  reachPct: number;
  clearanceMm: number;
  reachable: boolean;
  colliding: boolean;
}

export interface ArmTestReport {
  id: string;
  timestamp: string;
  status: VerdictStatus;
  maxReachPct: number;
  armMaxReachMeters: number;
  minClearanceMm: number;
  reachableWaypoints: number;
  totalWaypoints: number;
  summary: string;
  recommendation: string;
  jointSnapshot: {
    type: JointType;
    axis: JointAxis;
    axisSign: 1 | -1;
    minLimit: number;
    maxLimit: number;
  };
  samples: ArmWaypointSample[];
}

export interface AssemblyRecord {
  id: string;
  name: string;
  description: string;
  source: "lux3d-archived" | "lux3d-live" | "studio-upload";
  lineageLabel: string;
  lux3dMeta?: {
    version: string;
    rawTaskId?: number;
    splitTaskId?: number;
    rawMeshCount: number;
    splitMeshCount: number;
    totalTriangles: number;
    prompt?: string;
    expiresAt?: number | null;
  };
  rawGlbUrl?: string;
  splitGlbUrl: string;
  localBlobKey?: string;
  dimensions: [number, number, number]; // W, H, D in meters
  parts: MeshPartSpec[];
  joint: JointConfig;
  lastRun: ArmTestReport | null;
  runHistory: ArmTestReport[];
  updatedAt: string;
}
