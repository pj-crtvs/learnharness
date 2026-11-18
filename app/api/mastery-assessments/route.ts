import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const studentId = url.searchParams.get("studentId") ?? undefined;
	const conceptId = url.searchParams.get("conceptId") ?? undefined;
	return NextResponse.json({ assessments: knowledgeIntelligenceStore.listMasteryAssessments(studentId, conceptId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.studentId !== "string" || typeof body?.conceptId !== "string") {
		return NextResponse.json({ error: "studentId,conceptId required" }, { status: 400 });
	}
	const a = knowledgeIntelligenceStore.createMasteryAssessment({
		studentId: body.studentId,
		conceptId: body.conceptId,
		interventionPlanId: body.interventionPlanId,
		conceptual: body.conceptual ?? 0,
		independentRecall: body.independentRecall ?? 0,
		explanationQuality: body.explanationQuality ?? 0,
		application: body.application ?? 0,
		problemSolving: body.problemSolving ?? 0,
		transfer: body.transfer ?? 0,
		delayedRetention: body.delayedRetention,
		outcome: body.outcome ?? "insufficient_evidence",
	});
	return NextResponse.json({ assessment: a });
}