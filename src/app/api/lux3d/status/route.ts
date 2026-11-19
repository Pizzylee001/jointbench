import { NextResponse } from "next/server";

export async function GET() {
  const configured = Boolean(process.env.AHOLO_API_KEY && process.env.AHOLO_API_KEY.trim().length >= 6);
  return NextResponse.json({ configured });
}
