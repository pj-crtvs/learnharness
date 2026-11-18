import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";
import { validateKnowledgeGraphInput as validateKnowledgeGraph } from "@/src/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const nodes = body?.nodes ?? knowledgeIntelligenceStore.listNodes();
	const edges = body?.edges ?? knowledgeIntelligenceStore.listEdges();
	const result = validateKnowledgeGraph(nodes, edges);
	const rec = knowledgeIntelligenceStore.createValidationRecord({
		valid: result.valid,
		errors: result.errors,
		warnings: result.warnings,
	});
	return NextResponse.json({ ...result, record: rec });
}