import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callAholoApi, isAllowedAssetUrl, resolveAholoApiKey } from "@/lib/lux3d";

const partSplitSchema = z.object({
  glbUrl: z.string().url("Provide a valid HTTPS GLB URL returned by Lux3D."),
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

  const parsed = partSplitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid GLB URL." },
      { status: 400 }
    );
  }

  if (!isAllowedAssetUrl(parsed.data.glbUrl)) {
    return NextResponse.json(
      { error: "Only HTTPS Aholo/Kujiale Lux3D model URLs are permitted for server part-split." },
      { status: 400 }
    );
  }

  const result = await callAholoApi<number>(apiKey, "/global/lux3d/v1/part-split/task/create", {
    method: "POST",
    body: { glbUrl: parsed.data.glbUrl },
  });

  if (!result.ok || !result.data) {
    const isBusy =
      result.message?.toLowerCase().includes("concurrency") ||
      result.message?.toLowerCase().includes("progress") ||
      result.code?.includes("CONCURRENCY");
    return NextResponse.json(
      {
        error: isBusy
          ? "Part-Split slot is currently busy (Aholo permits 1 active part-split task per account). Wait for it to finish and retry."
          : result.message ?? "Failed to queue Lux3D part-split task.",
        code: result.code,
      },
      { status: isBusy ? 429 : result.status }
    );
  }

  return NextResponse.json({
    taskId: result.data,
    stage: "part-split",
    createdAt: Date.now(),
  });
}
