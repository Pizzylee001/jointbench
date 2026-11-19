"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Cube, GitFork, Rows } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  assemblyCount?: number;
  activeBenchId?: string;
}

const NAV_ITEMS = [
  { key: "registry", href: "/", label: "Registry", mobileLabel: "Registry", icon: Rows },
  { key: "foundry", href: "/foundry", label: "Lux3D Foundry", mobileLabel: "Foundry", icon: Cube },
  { key: "bench", href: "/bench", label: "Test Bench", mobileLabel: "Test Bench", icon: GitFork },
] as const;

export function AppHeader({ assemblyCount = 3, activeBenchId }: AppHeaderProps) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();

  const activeKey = pathname.startsWith("/foundry")
    ? "foundry"
    : pathname.startsWith("/bench")
      ? "bench"
      : "registry";

  const benchHref = activeBenchId ? `/bench/${activeBenchId}` : "/bench";

  return (
    <>
      <header className="sticky top-0 z-40 h-[60px] bg-[#F9FAFC]/95 backdrop-blur-sm border-b border-[#C4CFD9]">
        <div className="max-w-[1440px] mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-7 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] rounded-md"
              translate="no"
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="1.5" y="1.5" width="25" height="25" rx="6" fill="#0F1722" stroke="#334155" />
                <path d="M8 20V8.5H12V15.5H20.5V20H8Z" fill="#F8FAFC" />
                <circle cx="10" cy="17.8" r="2.3" fill="#2563EB" />
                <path d="M15 10.5L20 5.8" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="font-display text-[18px] font-extrabold tracking-[-0.025em] text-[#0F1722]">
                JointBench
              </span>
            </Link>

            <nav aria-label="Primary routes" className="hidden md:flex items-center gap-1 h-[60px]">
              {NAV_ITEMS.map((item) => {
                const isActive = activeKey === item.key;
                const Icon = item.icon;
                const href = item.key === "bench" ? benchHref : item.href;
                return (
                  <Link
                    key={item.key}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative h-[60px] inline-flex items-center gap-2 px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1D4ED8]",
                      isActive
                        ? "text-[#0F1722] font-semibold"
                        : "text-[#455468] font-medium hover:text-[#0F1722]"
                    )}
                  >
                    <Icon size={16} weight={isActive ? "bold" : "regular"} aria-hidden="true" />
                    <span>{item.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId={prefersReduced ? undefined : "nav-datum-bar"}
                        transition={{ type: "spring", stiffness: 440, damping: 32, mass: 0.8 }}
                        className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1D4ED8] rounded-t-[2px]"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-2 font-data text-[12px] text-[#455468] px-2.5 py-1.5 bg-[#E2E8F0] border border-[#C4CFD9] rounded-[6px]">
              <span className="w-1.5 h-1.5 rounded-[2px] bg-[#1D4ED8]" aria-hidden="true" />
              {assemblyCount} {assemblyCount === 1 ? "Lux3D Split" : "Lux3D Splits"} · G1-Turbo
            </span>
            <Link
              href={activeKey === "bench" ? "/foundry" : benchHref}
              className="btn-machined-primary inline-flex items-center justify-center min-h-[40px] md:min-h-[38px] px-3.5 rounded-[6px] text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              {activeKey === "bench" ? "New Lux3D Split" : "Open Test Bench"}
            </Link>
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobile routes"
        className="grid md:hidden grid-cols-3 gap-1.5 px-3 py-2 bg-[#F9FAFC] border-b border-[#C4CFD9]"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeKey === item.key;
          const href = item.key === "bench" ? benchHref : item.href;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "min-h-[44px] inline-flex items-center justify-center rounded-[6px] text-[13px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]",
                isActive
                  ? "bg-[#EDF3FF] border-[#93C5FD] text-[#1D4ED8] font-semibold"
                  : "bg-transparent border-transparent text-[#455468] font-medium"
              )}
            >
              {item.mobileLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
