import { NextRequest, NextResponse } from "next/server";
import { getAnimation, updateAnimation, deleteAnimation } from "@/src/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const anim = getAnimation(id);
	if (!anim) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ animation: anim });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	let body: Record<string, unknown> = {};
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "invalid json" }, { status: 400 });
	}
	const updated = updateAnimation(id, body as never);
	if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ animation: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const ok = deleteAnimation(id);
	if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
