import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callAholoApi, isAllowedAssetUrl, resolveAholoApiKey } from "@/lib/lux3d";

const articulateSchema = z.object({
  glbUrl: z.string().url("Provide a valid HTTPS GLB URL."),
  prompt: z.string().trim().min(6, "Describe the desired joint motion.").max(600),
});

export async function POST(req: NextRequest) {
  const apiKey = resolveAholoApiKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Aholo API key configured. Provide a session key or configure AHOLO_API_KEY." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const parsed = articulateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid articulation payload." },
      { status: 400 }
    );
  }

  if (!isAllowedAssetUrl(parsed.data.glbUrl)) {
    return NextResponse.json(
      { error: "Only HTTPS Aholo/Kujiale Lux3D URLs are permitted." },
      { status: 400 }
    );
  }

  const result = await callAholoApi<number>(apiKey, "/global/lux3d/v1/articulation-animation/task/create", {
    method: "POST",
    body: {
      glbUrl: parsed.data.glbUrl,
      prompt: parsed.data.prompt,
    },
  });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.message ?? "Failed to create articulation task.", code: result.code },
      { status: result.status }
    );
  }

  return NextResponse.json({
    taskId: result.data,
    stage: "articulate",
    createdAt: Date.now(),
  });
}
