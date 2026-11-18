import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const type = url.searchParams.get("type");
	const edges = knowledgeIntelligenceStore.listEdges();
	const filtered = type ? edges.filter((e) => e.type === type) : edges;
	return NextResponse.json({ edges: filtered });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.source !== "string" || typeof body?.target !== "string" || typeof body?.type !== "string") {
		return NextResponse.json({ error: "source,target,type required" }, { status: 400 });
	}
	const edge = knowledgeIntelligenceStore.createEdge({
		source: body.source,
		target: body.target,
		type: body.type,
		explanation: body.explanation,
		confidence: body.confidence,
		evidence: body.evidence,
		verified: body.verified ?? false,
		aiProposed: body.aiProposed ?? true,
		conditions: body.conditions,
	});
	return NextResponse.json({ edge });
}