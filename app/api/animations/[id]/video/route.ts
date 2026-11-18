import { NextRequest, NextResponse } from "next/server";
import { getAnimation, artifactPath } from "@/src/server";
import * as fs from "node:fs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const anim = getAnimation(id);
	if (!anim) return NextResponse.json({ error: "not found" }, { status: 404 });
	const local = artifactPath(id);
	if (!fs.existsSync(local)) {
		return NextResponse.json({ error: "artifact not ready" }, { status: 404 });
	}
	const stat = fs.statSync(local);
	const file = fs.readFileSync(local);
	return new NextResponse(file, {
		status: 200,
		headers: {
			"Content-Type": "video/mp4",
			"Content-Length": String(stat.size),
			"Accept-Ranges": "bytes",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
