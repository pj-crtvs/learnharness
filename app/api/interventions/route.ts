import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const studentId = url.searchParams.get("studentId") ?? undefined;
	return NextResponse.json({ plans: knowledgeIntelligenceStore.listInterventionPlans(studentId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.studentId !== "string" || typeof body?.targetConceptId !== "string") {
		return NextResponse.json({ error: "studentId,targetConceptId required" }, { status: 400 });
	}
	const plan = knowledgeIntelligenceStore.createInterventionPlan({
		studentId: body.studentId,
		sessionId: body.sessionId,
		targetConceptId: body.targetConceptId,
		rootCauseConceptId: body.rootCauseConceptId,
		activities: body.activities ?? [],
		status: body.status ?? "proposed",
		evaluatorDecision: body.evaluatorDecision,
	});
	return NextResponse.json({ plan });
}