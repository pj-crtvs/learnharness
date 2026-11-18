import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const studentId = url.searchParams.get("studentId") ?? undefined;
	const conceptId = url.searchParams.get("conceptId") ?? undefined;
	return NextResponse.json({ evidence: knowledgeIntelligenceStore.listEvidence(studentId, conceptId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.studentId !== "string" || typeof body?.conceptId !== "string") {
		return NextResponse.json({ error: "studentId,conceptId required" }, { status: 400 });
	}
	const ev = knowledgeIntelligenceStore.addEvidence({
		studentId: body.studentId,
		conceptId: body.conceptId,
		sourceType: body.sourceType ?? "assessment",
		activityId: body.activityId,
		correct: body.correct ?? false,
		score: body.score,
		independent: body.independent,
		hintUsed: body.hintUsed,
		reasoning: body.reasoning,
	});
	return NextResponse.json({ evidence: ev });
}