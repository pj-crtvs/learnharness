import { NextRequest, NextResponse } from "next/server";
import { getAnimation, updateAnimation, submitRender, rendererHealth } from "@/src/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const anim = getAnimation(id);
	if (!anim) return NextResponse.json({ error: "not found" }, { status: 404 });

	let body: Record<string, unknown> = {};
	try { body = await req.json(); } catch {}
	const quality = (body.quality as string) || anim.quality || "preview";

	const health = await rendererHealth();
	if (!health.ok) {
		return NextResponse.json({ error: `renderer unavailable: ${health.error}` }, { status: 503 });
	}

	try {
		const { jobId, sceneName } = await submitRender(anim.code, quality, anim.sceneName);
		const updated = updateAnimation(id, { status: "rendering", quality: quality as never, renderJobId: jobId, sceneName });
		return NextResponse.json({ animation: updated, jobId });
	} catch (e) {
		updateAnimation(id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
