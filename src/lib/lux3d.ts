import { NextRequest } from "next/server";

export const AHOLO_GLOBAL_BASE = "https://api.aholo.ai";

export interface AholoEnvelope<T = unknown> {
  c: string | number;
  m?: string;
  d: T;
  f?: unknown;
}

export interface Lux3DTaskOutput {
  content: string;
  format?: string;
}

export interface Lux3DTaskDetail {
  taskId: number;
  bizId?: string;
  status: number; // 0: init, 1: running, 3: succeeded, 4: failed, 6: canceled
  outputs?: Lux3DTaskOutput[];
  consumedCredits?: number;
  errorMessage?: string;
}

export function resolveAholoApiKey(req: NextRequest): string | null {
  const headerKey = req.headers.get("x-aholo-api-key")?.trim();
  if (headerKey && headerKey.length >= 6) {
    return headerKey;
  }
  const envKey = process.env.AHOLO_API_KEY?.trim();
  if (envKey && envKey.length >= 6) {
    return envKey;
  }
  return null;
}

export function isAllowedAssetUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith(".kujiale.com") ||
      host === "kujiale.com" ||
      host.endsWith(".aholo.ai") ||
      host === "aholo.ai" ||
      host.endsWith(".aholo3d.cn") ||
      host === "aholo3d.cn"
    );
  } catch {
    return false;
  }
}

export async function callAholoApi<T>(
  apiKey: string,
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data?: T; message?: string; code?: string }> {
  const method = options.method ?? "GET";
  const res = await fetch(`${AHOLO_GLOBAL_BASE}${path}`, {
    method,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: AholoEnvelope<T> | null = null;
  try {
    parsed = JSON.parse(text) as AholoEnvelope<T>;
  } catch {
    return {
      ok: false,
      status: res.status || 502,
      message: `Unexpected upstream response (${res.status})`,
    };
  }

  const codeStr = String(parsed.c ?? "");
  if (!res.ok || codeStr !== "0") {
    return {
      ok: false,
      status: res.status >= 400 ? res.status : 400,
      code: codeStr,
      message: parsed.m || `Aholo Lux3D returned error code ${codeStr || res.status}`,
    };
  }

  return {
    ok: true,
    status: 200,
    data: parsed.d,
  };
}

export function mapTaskStatusLabel(status: number): "queued" | "running" | "succeeded" | "failed" | "canceled" {
  switch (status) {
    case 0:
      return "queued";
    case 1:
    case 2:
      return "running";
    case 3:
      return "succeeded";
    case 6:
      return "canceled";
    default:
      return "failed";
  }
}
