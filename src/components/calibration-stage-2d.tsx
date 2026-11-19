"use client";

import Link from "next/link";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { solve3DofArmIK, transformPointByJoint } from "@/lib/kinematics";
import type { AssemblyRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CalibrationStage2DProps {
  assembly: AssemblyRecord;
  progress?: number; // 0..1
  scanNonce?: number;
  compact?: boolean;
  showOpenButton?: boolean;
}

export function CalibrationStage2D({
  assembly,
  progress = 0.65,
  scanNonce = 0,
  compact = false,
  showOpenButton = true,
}: CalibrationStage2DProps) {
  const { joint, lastRun, parts } = assembly;
  const clamped = Math.max(0, Math.min(1, progress));
  const q = joint.minLimit + (joint.maxLimit - joint.minLimit) * clamped;
  const handlePos = transformPointByJoint(joint.graspHandle, joint, q);
  const pose = solve3DofArmIK(joint.armBaseOffset, handlePos);

  const isPass = lastRun?.status === "pass";
  const isFail = lastRun?.status === "fail";
  const minClear = lastRun?.minClearanceMm ?? 0;

  // Map 3D Z/Y (side profile) onto SVG 540x200 stage cleanly
  const scale = 225;
  const originX = 165;
  const floorY = 164;
  const baseBottomY = -assembly.dimensions[1] / 2;

  const toSvg = (pt: [number, number, number]): [number, number] => {
    const sx = originX + pt[2] * scale;
    const sy = floorY - (pt[1] - baseBottomY) * scale;
    return [sx, sy];
  };

  const [baseSvgX, baseSvgY] = toSvg(pose.base);
  const [shSvgX, shSvgY] = toSvg(pose.shoulder);
  const [elSvgX, elSvgY] = toSvg(pose.elbow);
  const [eeSvgX, eeSvgY] = toSvg(pose.ee);

  const boxW = Math.max(76, Math.min(140, assembly.dimensions[2] * scale));
  const boxH = Math.max(62, Math.min(122, assembly.dimensions[1] * scale));
  const boxX = originX - boxW / 2;
  const boxY = floorY - boxH;

  const movingShiftPx =
    joint.type === "prismatic"
      ? clamped * Math.min(72, Math.max(24, (joint.maxLimit - joint.minLimit) * scale * 0.85))
      : 0;
  const movingRotDeg =
    joint.type === "revolute" ? -Math.min(115, q) * (joint.axis === "X" ? 0.85 : 0.45) : 0;

  const baseName = parts.find((p) => p.role === "base")?.label ?? "base_link";
  const movingName = parts.find((p) => p.role === "moving")?.label ?? "moving_link";

  const unit = joint.type === "prismatic" ? "m" : "°";
  const rangeLabel =
    joint.type === "prismatic"
      ? `Prismatic ${joint.axisSign > 0 ? "+" : "-"}${joint.axis} (${joint.minLimit.toFixed(2)}..${joint.maxLimit.toFixed(2)} m)`
      : `Revolute ${joint.axisSign > 0 ? "+" : "-"}${joint.axis} (${Math.round(joint.minLimit)}°..${Math.round(joint.maxLimit)}°)`;

  return (
    <div
      className={cn(
        "calibration-chamber relative overflow-hidden flex flex-col justify-between p-3.5",
        compact ? "min-h-[270px]" : "min-h-[304px]"
      )}
      aria-label={`Live kinematic stage preview for ${assembly.name}`}
    >
      <div
        key={scanNonce}
        className={cn("chamber-laser", scanNonce > 0 && "chamber-laser-active")}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-2">
        <div className="hud-capsule px-3 py-2">
          <div className="font-display text-[15px] font-bold text-[#F8FAFC] leading-snug">
            {assembly.name}
          </div>
          <div className="font-data text-[12px] text-[#94A3B8] mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
            <span className="text-[#60A5FA] whitespace-nowrap">{rangeLabel}</span>
            <span className="text-[#F1F5F9] whitespace-nowrap">
              Reach {lastRun?.maxReachPct ?? pose.reachPct}%
            </span>
            <span
              className={cn(
                "whitespace-nowrap",
                isFail ? "text-[#F87171]" : "text-[#34D399]"
              )}
            >
              {isFail ? `Collision ${minClear} mm` : `Clearance +${minClear} mm`}
            </span>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border font-data text-[12px] font-semibold whitespace-nowrap",
            isPass && "bg-[#ECFDF5] text-[#065F46] border-[#6EE7B7]",
            isFail && "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]",
            !isPass && !isFail && "bg-[#FFFBEB] text-[#92400E] border-[#FCD34D]"
          )}
        >
          {isPass ? (
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
          ) : (
            <WarningCircle size={14} weight="fill" aria-hidden="true" />
          )}
          {isPass
            ? `PASS · +${minClear} mm`
            : isFail
              ? `FAIL · ${minClear} mm`
              : "UNCALIBRATED"}
        </span>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center py-2">
        <svg
          viewBox="0 0 540 188"
          className="w-full max-w-[520px] h-auto"
          role="img"
          aria-label={`Kinematic diagram of ${assembly.name} with 3-DOF robot arm reaching grasp handle`}
        >
          <defs>
            <linearGradient id={`armGrad-${assembly.id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
            <linearGradient id={`bodyGrad-${assembly.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1E293B" />
            </linearGradient>
          </defs>

          {/* Perspective Floor */}
          <line x1="20" y1={floorY} x2="520" y2={floorY} stroke="#334155" strokeWidth="1.2" />
          <line x1="90" y1={floorY} x2="62" y2="185" stroke="#1E293B" strokeWidth="1" />
          <line x1="205" y1={floorY} x2="192" y2="185" stroke="#1E293B" strokeWidth="1" />
          <line x1="325" y1={floorY} x2="338" y2="185" stroke="#1E293B" strokeWidth="1" />
          <line x1="445" y1={floorY} x2="474" y2="185" stroke="#1E293B" strokeWidth="1" />
          <ellipse cx={originX} cy={floorY + 2} rx={boxW * 0.72} ry="6" fill="#000000" fillOpacity="0.45" />
          <ellipse cx={Math.min(470, Math.max(300, baseSvgX))} cy={floorY + 2} rx="40" ry="5.5" fill="#000000" fillOpacity="0.45" />

          {/* Swept Clearance Envelope */}
          <rect
            x={boxX + boxW * 0.35}
            y={boxY + 12}
            width={Math.max(84, boxW * 0.8 + movingShiftPx)}
            height={Math.max(42, boxH * 0.44)}
            rx="4"
            fill={isFail ? "#EF4444" : "#10B981"}
            fillOpacity="0.16"
            stroke={isFail ? "#F87171" : "#34D399"}
            strokeWidth="1.3"
            strokeDasharray="5 4"
          />

          {/* Base Mesh Silhouette */}
          <polygon
            points={`${boxX},${boxY} ${boxX + boxW},${boxY} ${boxX + boxW + 12},${boxY + 9} ${boxX + 12},${boxY + 9}`}
            fill="#475569"
            stroke="#64748B"
            strokeWidth="1"
          />
          <rect
            x={boxX}
            y={boxY}
            width={boxW}
            height={boxH}
            rx="2"
            fill={`url(#bodyGrad-${assembly.id})`}
            stroke="#64748B"
            strokeWidth="1.4"
          />

          {/* URDF Base Triad */}
          <line x1={boxX} y1={floorY} x2={boxX + 34} y2={floorY} stroke="#EF4444" strokeWidth="2" />
          <line x1={boxX} y1={floorY} x2={boxX} y2={floorY - 34} stroke="#22C55E" strokeWidth="2" />

          {/* Moving Link Silhouette */}
          {joint.type === "prismatic" ? (
            <g transform={`translate(${movingShiftPx.toFixed(1)}, 0)`}>
              <rect
                x={boxX + boxW * 0.25}
                y={boxY + 16}
                width={boxW * 0.78}
                height={Math.max(30, boxH * 0.34)}
                rx="2"
                fill="#2563EB"
                fillOpacity="0.44"
                stroke="#60A5FA"
                strokeWidth="1.8"
              />
              <circle
                cx={eeSvgX}
                cy={eeSvgY}
                r="5.5"
                fill="#F59E0B"
                stroke="#FEF3C7"
                strokeWidth="1.7"
              />
            </g>
          ) : (
            <g
              transform={`rotate(${movingRotDeg.toFixed(1)}, ${boxX + (joint.axis === "X" ? 6 : boxW - 6)}, ${boxY + 6})`}
            >
              <rect
                x={boxX + 4}
                y={boxY - 6}
                width={boxW - 4}
                height={18}
                rx="2"
                fill="#2563EB"
                fillOpacity="0.48"
                stroke="#60A5FA"
                strokeWidth="1.8"
              />
            </g>
          )}

          {/* Target Grasp Handle & Collision Callout */}
          <circle cx={eeSvgX} cy={eeSvgY} r="5.5" fill="#F59E0B" stroke="#FEF3C7" strokeWidth="1.7" />
          {isFail && (
            <g>
              <circle
                cx={eeSvgX}
                cy={eeSvgY}
                r="14"
                fill="#EF4444"
                fillOpacity="0.22"
                stroke="#F87171"
                strokeWidth="1.5"
              />
              <text
                x={Math.min(440, Math.max(90, eeSvgX))}
                y={Math.max(24, eeSvgY - 20)}
                textAnchor="middle"
                fill="#FCA5A5"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="700"
              >
                INTERFERENCE {minClear} mm
              </text>
            </g>
          )}

          {/* 3-DOF Robot Arm Pedestal & Links */}
          <rect
            x={Math.min(446, Math.max(290, baseSvgX - 26))}
            y={floorY - 22}
            width="52"
            height="22"
            rx="3"
            fill="#334155"
            stroke="#94A3B8"
            strokeWidth="1.3"
          />
          <line
            x1={Math.min(472, Math.max(316, shSvgX))}
            y1={Math.min(floorY - 22, shSvgY)}
            x2={Math.min(480, Math.max(120, elSvgX))}
            y2={Math.max(18, Math.min(floorY - 12, elSvgY))}
            stroke={`url(#armGrad-${assembly.id})`}
            strokeWidth="8.5"
            strokeLinecap="round"
          />
          <line
            x1={Math.min(480, Math.max(120, elSvgX))}
            y1={Math.max(18, Math.min(floorY - 12, elSvgY))}
            x2={Math.min(460, Math.max(90, eeSvgX))}
            y2={Math.max(20, Math.min(floorY - 12, eeSvgY))}
            stroke="#93C5FD"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle
            cx={Math.min(472, Math.max(316, shSvgX))}
            cy={Math.min(floorY - 22, shSvgY)}
            r="6"
            fill="#1D4ED8"
            stroke="#F8FAFC"
            strokeWidth="1.6"
          />
          <circle
            cx={Math.min(480, Math.max(120, elSvgX))}
            cy={Math.max(18, Math.min(floorY - 12, elSvgY))}
            r="5.5"
            fill="#1D4ED8"
            stroke="#F8FAFC"
            strokeWidth="1.6"
          />
          <circle
            cx={Math.min(460, Math.max(90, eeSvgX))}
            cy={Math.max(20, Math.min(floorY - 12, eeSvgY))}
            r="4.5"
            fill={isFail ? "#F87171" : "#34D399"}
            stroke="#064E3B"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="vernier-scale">
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.75)] transition-all duration-200"
            style={{ left: `${Math.round(clamped * 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-data text-[11px] text-[#94A3B8]">
            {baseName} -&gt; <span className="text-[#CBD5E1]">{movingName}</span> · q ={" "}
            <span className="text-[#60A5FA]">
              {joint.type === "prismatic" ? `${q.toFixed(2)} ${unit}` : `${Math.round(q)}${unit}`}
            </span>
          </span>
          {showOpenButton && (
            <Link
              href={`/bench/${assembly.id}`}
              className="btn-machined-dark inline-flex items-center justify-center min-h-[34px] px-3 rounded-[6px] text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]"
            >
              Calibrate in 3D Bench
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
