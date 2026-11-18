import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const node = knowledgeIntelligenceStore.getNode(id);
	if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ node });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	const node = knowledgeIntelligenceStore.updateNode(id, body);
	if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ node });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const ok = knowledgeIntelligenceStore.deleteNode(id);
	if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}