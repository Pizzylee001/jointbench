import type {
  ArmTestReport,
  ArmWaypointSample,
  AssemblyRecord,
  JointAxis,
  JointConfig,
  MeshPartSpec,
} from "@/lib/types";

export const ARM_LINK_1 = 0.44; // meters (shoulder -> elbow)
export const ARM_LINK_2 = 0.41; // meters (elbow -> gripper TCP)
export const ARM_MAX_REACH = ARM_LINK_1 + ARM_LINK_2; // 0.85 m
export const ARM_MIN_REACH = 0.14; // meters (base collision zone)
export const ARM_PEDESTAL_HEIGHT = 0.14; // meters above arm base Y

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArmPose3D {
  base: [number, number, number];
  shoulder: [number, number, number];
  elbow: [number, number, number];
  ee: [number, number, number];
  reachable: boolean;
  reachMeters: number;
  reachPct: number;
  yawAngle: number;
  shoulderAngle: number;
  elbowAngle: number;
}

export function axisVector(axis: JointAxis, sign: 1 | -1): [number, number, number] {
  if (axis === "X") return [sign, 0, 0];
  if (axis === "Y") return [0, sign, 0];
  return [0, 0, sign];
}

export function transformPointByJoint(
  point: [number, number, number],
  joint: JointConfig,
  q: number
): [number, number, number] {
  const [px, py, pz] = point;
  if (joint.type === "prismatic") {
    const d = q * joint.axisSign;
    if (joint.axis === "X") return [px + d, py, pz];
    if (joint.axis === "Y") return [px, py + d, pz];
    return [px, py, pz + d];
  }

  // Revolute rotation around pivot along signed axis
  const rad = (q * Math.PI) / 180 * joint.axisSign;
  const [ox, oy, oz] = joint.pivot;
  const rx = px - ox;
  const ry = py - oy;
  const rz = pz - oz;
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  if (joint.axis === "X") {
    return [ox + rx, oy + (ry * c - rz * s), oz + (ry * s + rz * c)];
  }
  if (joint.axis === "Y") {
    return [ox + (rx * c + rz * s), oy + ry, oz + (-rx * s + rz * c)];
  }
  return [ox + (rx * c - ry * s), oy + (rx * s + ry * c), oz + rz];
}

/**
 * Analytic 3-DOF spatial IK solver (Base Yaw + Shoulder Pitch + Elbow Pitch).
 */
export function solve3DofArmIK(
  armBase: [number, number, number],
  target: [number, number, number]
): ArmPose3D {
  const shoulder: [number, number, number] = [
    armBase[0],
    armBase[1] + ARM_PEDESTAL_HEIGHT,
    armBase[2],
  ];

  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const dz = target[2] - shoulder[2];

  const planarDist = Math.hypot(dx, dz);
  const dist = Math.hypot(planarDist, dy);
  const yawAngle = Math.atan2(dx, dz);

  const reachable = dist <= ARM_MAX_REACH - 0.005 && dist >= ARM_MIN_REACH;
  const clampedDist = Math.max(ARM_MIN_REACH, Math.min(ARM_MAX_REACH - 0.004, dist));

  const cosElbow = Math.max(
    -1,
    Math.min(
      1,
      (ARM_LINK_1 * ARM_LINK_1 + ARM_LINK_2 * ARM_LINK_2 - clampedDist * clampedDist) /
        (2 * ARM_LINK_1 * ARM_LINK_2)
    )
  );
  const elbowInterior = Math.acos(cosElbow);

  const cosAlpha = Math.max(
    -1,
    Math.min(
      1,
      (ARM_LINK_1 * ARM_LINK_1 + clampedDist * clampedDist - ARM_LINK_2 * ARM_LINK_2) /
        (2 * ARM_LINK_1 * clampedDist)
    )
  );
  const targetElevation = Math.atan2(dy, Math.max(1e-5, planarDist));
  // Elbow-up configuration keeps the forearm clear of the tabletop/object base
  const shoulderAngle = targetElevation + Math.acos(cosAlpha);
  const elbowAngle = Math.PI - elbowInterior;

  const elbowRadial = ARM_LINK_1 * Math.cos(shoulderAngle);
  const elbowY = shoulder[1] + ARM_LINK_1 * Math.sin(shoulderAngle);
  const unitX = planarDist > 1e-5 ? dx / planarDist : 0;
  const unitZ = planarDist > 1e-5 ? dz / planarDist : -1;

  const elbow: [number, number, number] = [
    shoulder[0] + unitX * elbowRadial,
    elbowY,
    shoulder[2] + unitZ * elbowRadial,
  ];

  const eeRadial = clampedDist * Math.cos(targetElevation);
  const ee: [number, number, number] = [
    shoulder[0] + unitX * eeRadial,
    shoulder[1] + clampedDist * Math.sin(targetElevation),
    shoulder[2] + unitZ * eeRadial,
  ];

  const reachPct = Math.min(130, Math.round((dist / ARM_MAX_REACH) * 100));

  return {
    base: armBase,
    shoulder,
    elbow,
    ee,
    reachable,
    reachMeters: Number(dist.toFixed(3)),
    reachPct,
    yawAngle,
    shoulderAngle,
    elbowAngle,
  };
}

function getCombinedBounds(parts: MeshPartSpec[]): {
  min: [number, number, number];
  max: [number, number, number];
} {
  if (parts.length === 0) {
    return { min: [-0.2, -0.2, -0.2], max: [0.2, 0.2, 0.2] };
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let k = 0; k < 3; k++) {
      if (p.min[k] < min[k]) min[k] = p.min[k];
      if (p.max[k] > max[k]) max[k] = p.max[k];
    }
  }
  return { min, max };
}

function pointToAabbSignedDistance(
  pt: [number, number, number],
  min: [number, number, number],
  max: [number, number, number]
): number {
  const dx = Math.max(min[0] - pt[0], 0, pt[0] - max[0]);
  const dy = Math.max(min[1] - pt[1], 0, pt[1] - max[1]);
  const dz = Math.max(min[2] - pt[2], 0, pt[2] - max[2]);
  if (dx > 0 || dy > 0 || dz > 0) {
    return Math.hypot(dx, dy, dz);
  }
  // Inside AABB: negative penetration depth
  const penX = Math.min(pt[0] - min[0], max[0] - pt[0]);
  const penY = Math.min(pt[1] - min[1], max[1] - pt[1]);
  const penZ = Math.min(pt[2] - min[2], max[2] - pt[2]);
  return -Math.min(penX, penY, penZ);
}

/**
 * Evaluates a full 24-waypoint 3-DOF robotic arm grasp sweep across the configured joint limits.
 */
export function runArmCalibrationTest(
  assembly: Pick<AssemblyRecord, "parts" | "joint" | "dimensions">,
  waypointCount = 24
): ArmTestReport {
  const { joint, parts, dimensions } = assembly;
  const baseParts = parts.filter((p) => p.role === "base");
  const movingParts = parts.filter((p) => p.role === "moving");
  const baseBounds = getCombinedBounds(baseParts.length > 0 ? baseParts : parts);

  const samples: ArmWaypointSample[] = [];
  let maxReachPct = 0;
  let minClearanceMm = Infinity;
  let reachableWaypoints = 0;
  let collisionCount = 0;
  let firstFailReason: string | null = null;

  const span = joint.maxLimit - joint.minLimit;
  const safeMaxPrismatic = Math.max(0.18, Number((dimensions[2] * 0.72).toFixed(2)));
  const safeMaxRevolute = 104; // Rear hinge clearance wall behind base plane

  for (let i = 0; i < waypointCount; i++) {
    const t = waypointCount === 1 ? 0 : i / (waypointCount - 1);
    const q = joint.minLimit + span * t;
    const handlePos = transformPointByJoint(joint.graspHandle, joint, q);
    const pose = solve3DofArmIK(joint.armBaseOffset, handlePos);

    // Check forearm midpoint clearance against static base body
    const forearmMid: [number, number, number] = [
      (pose.elbow[0] + pose.ee[0]) / 2,
      (pose.elbow[1] + pose.ee[1]) / 2,
      (pose.elbow[2] + pose.ee[2]) / 2,
    ];
    const forearmClearM = pointToAabbSignedDistance(forearmMid, baseBounds.min, baseBounds.max) - 0.018;

    // Check physical mechanical envelope clearance (rail over-extension or hinge back-wall impact)
    let mechanicalClearM = 0.032;
    if (joint.type === "prismatic") {
      mechanicalClearM = safeMaxPrismatic - Math.abs(q);
    } else {
      const degMargin = safeMaxRevolute - Math.abs(q);
      mechanicalClearM = (degMargin * Math.PI) / 180 * 0.16;
    }

    const signedClearM = Math.min(forearmClearM, mechanicalClearM);
    const clearanceMm = Math.round(signedClearM * 1000);
    const colliding = clearanceMm < 0 || movingParts.length === 0;

    if (pose.reachable) reachableWaypoints++;
    if (pose.reachPct > maxReachPct) maxReachPct = pose.reachPct;
    if (clearanceMm < minClearanceMm) minClearanceMm = clearanceMm;

    if (colliding) {
      collisionCount++;
      if (!firstFailReason) {
        if (movingParts.length === 0) {
          firstFailReason = "No moving sub-mesh bound to this joint.";
        } else if (joint.type === "revolute" && Math.abs(q) > safeMaxRevolute) {
          firstFailReason = `Hinge rotation exceeds rear clearance envelope at ${Math.round(q)} deg (${clearanceMm} mm interference).`;
        } else if (joint.type === "prismatic" && Math.abs(q) > safeMaxPrismatic) {
          firstFailReason = `Linear slide exceeds rail stability depth at ${q.toFixed(2)} m (${clearanceMm} mm over-extension).`;
        } else {
          firstFailReason = `Robot forearm collides with base chassis at q = ${joint.type === "prismatic" ? `${q.toFixed(2)} m` : `${Math.round(q)} deg`} (${clearanceMm} mm).`;
        }
      }
    } else if (!pose.reachable && !firstFailReason) {
      firstFailReason = `Target handle exceeds 0.85 m robot workspace at ${pose.reachMeters.toFixed(2)} m (${pose.reachPct}%).`;
    }

    samples.push({
      t,
      q: Number(q.toFixed(3)),
      handlePos,
      shoulderAngle: Number(pose.shoulderAngle.toFixed(3)),
      elbowAngle: Number(pose.elbowAngle.toFixed(3)),
      yawAngle: Number(pose.yawAngle.toFixed(3)),
      reachMeters: pose.reachMeters,
      reachPct: pose.reachPct,
      clearanceMm,
      reachable: pose.reachable,
      colliding,
    });
  }

  const invalidLimits = joint.minLimit >= joint.maxLimit;
  const passed = !invalidLimits && reachableWaypoints === waypointCount && collisionCount === 0 && movingParts.length > 0;

  let summary = "";
  let recommendation = "";
  if (invalidLimits) {
    summary = "Invalid joint limits: Min Limit must be strictly less than Max Limit.";
    recommendation = "Increase Max Limit above Min Limit and re-run the arm sweep.";
  } else if (passed) {
    summary = `All ${waypointCount} trajectory waypoints reachable within ${ARM_MAX_REACH.toFixed(2)} m workspace; +${minClearanceMm} mm minimum body clearance.`;
    recommendation = "Ready to export Sim-Ready URDF ZIP for MuJoCo, Isaac Sim, or ROS 2.";
  } else {
    summary = firstFailReason ?? "Arm sweep encountered workspace or collision violation.";
    if (joint.type === "revolute") {
      recommendation = `Reduce Max Limit below ${safeMaxRevolute - 4} deg or shift arm base closer to the handle arc.`;
    } else {
      recommendation = `Trim Max Limit to <= ${(safeMaxPrismatic - 0.02).toFixed(2)} m to maintain positive rail clearance.`;
    }
  }

  return {
    id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    status: passed ? "pass" : "fail",
    maxReachPct,
    armMaxReachMeters: ARM_MAX_REACH,
    minClearanceMm: Number.isFinite(minClearanceMm) ? minClearanceMm : 0,
    reachableWaypoints,
    totalWaypoints: waypointCount,
    summary,
    recommendation,
    jointSnapshot: {
      type: joint.type,
      axis: joint.axis,
      axisSign: joint.axisSign,
      minLimit: joint.minLimit,
      maxLimit: joint.maxLimit,
    },
    samples,
  };
}
