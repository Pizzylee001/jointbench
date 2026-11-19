import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callAholoApi, resolveAholoApiKey } from "@/lib/lux3d";

const generateSchema = z.object({
  prompt: z.string().trim().min(4, "Describe the object to generate (at least 4 characters).").max(800),
  version: z.enum(["G1-Turbo", "G1"]).default("G1-Turbo"),
  style: z
    .enum(["photorealistic", "cartoon", "anime", "hand_painted", "cyberpunk", "fantasy", "glass"])
    .default("photorealistic"),
  faceCount: z.number().int().min(10000).max(300000).default(60000),
  enablePbr: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const apiKey = resolveAholoApiKey(req);
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No Aholo API key configured. Set AHOLO_API_KEY in server environment or provide a session key in Foundry settings.",
      },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid generation parameters." },
      { status: 400 }
    );
  }

  const { prompt, version, style, faceCount, enablePbr } = parsed.data;
  const result = await callAholoApi<number>(apiKey, "/global/lux3d/v1/generate/text-to-3d/task/create", {
    method: "POST",
    body: {
      prompt,
      version,
      style,
      faceCount,
      outputFormat: ["glb"],
      enablePbr,
      aiPredictSize: true,
    },
  });

  if (!result.ok || !result.data) {
    const isConcurrency = result.message?.includes("CONCURRENCY") || result.code?.includes("CONCURRENCY");
    return NextResponse.json(
      {
        error: isConcurrency
          ? "Aholo Lux3D generation concurrency limit reached. Wait for an active job to complete before retrying."
          : result.message ?? "Failed to create Lux3D generation task.",
        code: result.code,
      },
      { status: isConcurrency ? 429 : result.status }
    );
  }

  return NextResponse.json({
    taskId: result.data,
    stage: "generate",
    version,
    createdAt: Date.now(),
  });
}
