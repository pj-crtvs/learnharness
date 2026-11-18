import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PATHS } from "@/config";
import { documentStore } from "@/src/server";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; figureId: string }> }) {
	const { id, figureId } = await params;
	const fig = documentStore.getFigure(id, figureId);
	if (!fig) return NextResponse.json({ error: "not found" }, { status: 404 });
	const abs = path.join(PATHS.data, fig.imageFile);
	if (!fs.existsSync(abs)) return NextResponse.json({ error: "image missing" }, { status: 404 });
	const buf = fs.readFileSync(abs);
	return new Response(buf, { headers: { "Content-Type": fig.mimeType || "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
}
