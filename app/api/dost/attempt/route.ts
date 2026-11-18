import { NextResponse } from "next/server";
import { dostStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.questionId !== "string" || typeof body?.answer !== "string" || typeof body?.domain !== "string") {
		return NextResponse.json({ error: "questionId,answer,domain required" }, { status: 400 });
	}
	const q = dostStore.getQuestion(body.questionId);
	if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });
	const attempt = dostStore.recordAttempt({ questionId: body.questionId, domain: body.domain, answer: body.answer, correct: body.answer === q.correct, timeSpent: Number(body.timeSpent) || 0 });
	return NextResponse.json({ attempt, correct: attempt.correct, explanation: q.explanation });
}
