import { NextResponse } from "next/server";
import { rendererHealth } from "@/src/server";

export async function GET() {
	const h = await rendererHealth();
	return NextResponse.json(h, { status: h.ok ? 200 : 503 });
}
