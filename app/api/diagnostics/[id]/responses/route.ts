import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	if (typeof body?.questionId !== "string" || typeof body?.answer !== "string") {
		return NextResponse.json({ error: "questionId,answer required" }, { status: 400 });
	}
	const r = knowledgeIntelligenceStore.createDiagnosticResponse({
		questionId: body.questionId,
		sessionId: id,
		answer: body.answer,
		reasoning: body.reasoning,
		correct: body.correct ?? false,
		score: body.score,
	});
	return NextResponse.json({ response: r });
}