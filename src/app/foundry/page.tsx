import type { Metadata } from "next";
import { FoundryWorkspace } from "@/components/foundry-workspace";

export const metadata: Metadata = {
  title: "Lux3D Pipeline Foundry | JointBench",
  description:
    "Generate 3D meshes via Aholo Lux3D G1-Turbo, split monolithic meshes into independent kinematic links, or import local Studio GLB files.",
};

export default function FoundryPage() {
  return <FoundryWorkspace />;
}
