import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const type = url.searchParams.get("type");
	const nodes = knowledgeIntelligenceStore.listNodes();
	const filtered = type ? nodes.filter((n) => n.type === type) : nodes;
	return NextResponse.json({ nodes: filtered });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.name !== "string" || typeof body?.type !== "string") {
		return NextResponse.json({ error: "name,type required" }, { status: 400 });
	}
	const node = knowledgeIntelligenceStore.createNode({
		name: body.name,
		description: body.description,
		type: body.type,
		subject: body.subject,
		classification: body.classification,
		difficulty: body.difficulty,
		learningObjectives: body.learningObjectives,
		requiredPriorKnowledge: body.requiredPriorKnowledge,
		relatedConcepts: body.relatedConcepts,
		formulas: body.formulas,
		principles: body.principles,
		commonMisconceptions: body.commonMisconceptions,
		examples: body.examples,
		lessons: body.lessons,
		exercises: body.exercises,
		sourceReferences: body.sourceReferences,
		confidence: body.confidence,
		verificationStatus: body.verificationStatus ?? "ai_proposed",
	});
	return NextResponse.json({ node });
}