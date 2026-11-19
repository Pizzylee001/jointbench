import { NextRequest, NextResponse } from "next/server";
import { callAholoApi, Lux3DTaskDetail, mapTaskStatusLabel, resolveAholoApiKey } from "@/lib/lux3d";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const apiKey = resolveAholoApiKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Aholo API key configured." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid numeric Lux3D task ID." }, { status: 400 });
  }

  const result = await callAholoApi<Lux3DTaskDetail>(
    apiKey,
    `/global/lux3d/v1/generate/task/get?taskid=${encodeURIComponent(id)}`,
    { method: "GET" }
  );

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.message ?? "Failed to query Lux3D task status." },
      { status: result.status }
    );
  }

  const outputs = (result.data.outputs ?? [])
    .map((o) => o?.content)
    .filter((u): u is string => Boolean(u && u !== "NOT_REQUESTED" && u !== "null"));

  const glbUrl = outputs.find((u) => u.toLowerCase().includes(".glb")) ?? outputs[0] ?? null;

  return NextResponse.json({
    taskId: result.data.taskId ?? Number(id),
    statusCode: result.data.status,
    status: mapTaskStatusLabel(result.data.status),
    glbUrl,
    outputs,
    expiresAt: result.data.status === 3 ? Date.now() + 2 * 60 * 60 * 1000 : null,
  });
}
