import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";
import { transitivePrerequisites, getPrerequisites, getDependents } from "@/src/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const conceptId = url.searchParams.get("conceptId");
	if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
	const edges = knowledgeIntelligenceStore.listEdges();
	const prereqs = getPrerequisites(conceptId, edges);
	const dependents = getDependents(conceptId, edges);
	const transitive = transitivePrerequisites(conceptId, edges);
	return NextResponse.json({ conceptId, prerequisites: prereqs, dependents, transitivePrerequisites: transitive });
}