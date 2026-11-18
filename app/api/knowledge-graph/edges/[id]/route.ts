import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const ok = knowledgeIntelligenceStore.deleteEdge(id);
	if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ ok: true });
}