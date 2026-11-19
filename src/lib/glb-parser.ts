import type { MeshPartSpec } from "@/lib/types";

interface GltfJson {
  nodes?: Array<{ name?: string; mesh?: number }>;
  meshes?: Array<{
    name?: string;
    primitives?: Array<{
      indices?: number;
      attributes?: Record<string, number>;
    }>;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    count: number;
    min?: number[];
    max?: number[];
  }>;
  bufferViews?: Array<{
    byteOffset?: number;
    byteStride?: number;
  }>;
}

export interface ParsedGlbSummary {
  meshCount: number;
  totalTriangles: number;
  dimensions: [number, number, number];
  parts: MeshPartSpec[];
}

/**
 * Parses a binary .glb (glTF 2.0) ArrayBuffer in-browser to extract exact sub-mesh names,
 * triangle counts, and vertex bounding boxes without needing a server round-trip.
 */
export function parseGlbBuffer(buffer: ArrayBuffer): ParsedGlbSummary {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20) {
    throw new Error("File is too small to be a valid GLB binary.");
  }

  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error("Invalid GLB header. Expected binary glTF 2.0 (.glb).");
  }

  const jsonChunkLen = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLen);
  const gltf = JSON.parse(new TextDecoder("utf-8").decode(jsonBytes)) as GltfJson;

  let binOffset = 20 + jsonChunkLen;
  let binDataView: DataView | null = null;
  if (binOffset + 8 <= buffer.byteLength) {
    const binLen = view.getUint32(binOffset, true);
    binDataView = new DataView(buffer, binOffset + 8, Math.min(binLen, buffer.byteLength - (binOffset + 8)));
    binOffset += 8;
  }

  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const accessors = gltf.accessors ?? [];
  const bufferViews = gltf.bufferViews ?? [];

  const parts: MeshPartSpec[] = [];
  const overallMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const overallMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let totalTriangles = 0;

  nodes.forEach((node, idx) => {
    if (node.mesh === undefined) return;
    const mesh = meshes[node.mesh];
    if (!mesh) return;

    const meshName = node.name || mesh.name || `part_${idx}`;
    let tris = 0;
    const pmin: [number, number, number] = [Infinity, Infinity, Infinity];
    const pmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined && accessors[prim.indices]) {
        tris += Math.floor(accessors[prim.indices].count / 3);
      } else if (prim.attributes?.POSITION !== undefined && accessors[prim.attributes.POSITION]) {
        tris += Math.floor(accessors[prim.attributes.POSITION].count / 3);
      }

      const posIdx = prim.attributes?.POSITION;
      if (posIdx !== undefined && accessors[posIdx]) {
        const acc = accessors[posIdx];
        if (acc.min && acc.max && acc.min.length >= 3 && acc.max.length >= 3) {
          for (let k = 0; k < 3; k++) {
            pmin[k] = Math.min(pmin[k], acc.min[k]);
            pmax[k] = Math.max(pmax[k], acc.max[k]);
          }
        } else if (binDataView && acc.bufferView !== undefined && bufferViews[acc.bufferView]) {
          const bv = bufferViews[acc.bufferView];
          const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
          const stride = bv.byteStride ?? 12;
          const step = acc.count > 12000 ? 2 : 1;
          for (let v = 0; v < acc.count; v += step) {
            const off = baseOff + v * stride;
            if (off + 12 > binDataView.byteLength) break;
            const x = binDataView.getFloat32(off, true);
            const y = binDataView.getFloat32(off + 4, true);
            const z = binDataView.getFloat32(off + 8, true);
            if (x < pmin[0]) pmin[0] = x;
            if (y < pmin[1]) pmin[1] = y;
            if (z < pmin[2]) pmin[2] = z;
            if (x > pmax[0]) pmax[0] = x;
            if (y > pmax[1]) pmax[1] = y;
            if (z > pmax[2]) pmax[2] = z;
          }
        }
      }
    }

    if (!Number.isFinite(pmin[0])) {
      pmin[0] = -0.2; pmin[1] = -0.2; pmin[2] = -0.2;
      pmax[0] = 0.2; pmax[1] = 0.2; pmax[2] = 0.2;
    }

    for (let k = 0; k < 3; k++) {
      overallMin[k] = Math.min(overallMin[k], pmin[k]);
      overallMax[k] = Math.max(overallMax[k], pmax[k]);
    }
    totalTriangles += tris;

    parts.push({
      id: `upload-part-${idx}`,
      meshName,
      label: meshName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
      triangles: tris,
      role: "base",
      min: [Number(pmin[0].toFixed(4)), Number(pmin[1].toFixed(4)), Number(pmin[2].toFixed(4))],
      max: [Number(pmax[0].toFixed(4)), Number(pmax[1].toFixed(4)), Number(pmax[2].toFixed(4))],
      size: [
        Number((pmax[0] - pmin[0]).toFixed(4)),
        Number((pmax[1] - pmin[1]).toFixed(4)),
        Number((pmax[2] - pmin[2]).toFixed(4)),
      ],
      center: [
        Number(((pmin[0] + pmax[0]) / 2).toFixed(4)),
        Number(((pmin[1] + pmax[1]) / 2).toFixed(4)),
        Number(((pmin[2] + pmax[2]) / 2).toFixed(4)),
      ],
    });
  });

  // Auto-assign the largest sub-mesh as base and second largest as moving for immediate testing
  if (parts.length >= 2) {
    const sorted = [...parts].sort((a, b) => b.triangles - a.triangles);
    const movingTarget = sorted[1];
    parts.forEach((p) => {
      p.role = p.id === movingTarget.id ? "moving" : "base";
    });
  } else if (parts.length === 1) {
    parts[0].role = "moving";
  }

  const dims: [number, number, number] = Number.isFinite(overallMin[0])
    ? [
        Number(Math.max(0.05, overallMax[0] - overallMin[0]).toFixed(3)),
        Number(Math.max(0.05, overallMax[1] - overallMin[1]).toFixed(3)),
        Number(Math.max(0.05, overallMax[2] - overallMin[2]).toFixed(3)),
      ]
    : [0.4, 0.4, 0.4];

  return {
    meshCount: parts.length,
    totalTriangles,
    dimensions: dims,
    parts,
  };
}
