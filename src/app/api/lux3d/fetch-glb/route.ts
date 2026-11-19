import { NextRequest, NextResponse } from "next/server";
import { isAllowedAssetUrl } from "@/lib/lux3d";

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl || !isAllowedAssetUrl(targetUrl)) {
    return NextResponse.json(
      { error: "Invalid or disallowed model URL. Only Aholo/Kujiale HTTPS CDN URLs are allowed." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(targetUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Failed to fetch upstream GLB (${upstream.status}). Temporary Lux3D URLs expire after 2 hours.` },
        { status: upstream.status }
      );
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream GLB download failed." }, { status: 502 });
  }
}
