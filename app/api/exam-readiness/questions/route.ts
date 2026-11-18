import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const examId = searchParams.get("examId") ?? undefined;
	return NextResponse.json({ questions: examReadinessStore.listQuestions(examId) });
}

export async function POST(req: Request) {
	const body = await req.json();
	if (Array.isArray(body.questions)) {
		const qs = examReadinessStore.addQuestions(body.questions);
		return NextResponse.json({ questions: qs });
	}
	const q = examReadinessStore.addQuestion(body);
	return NextResponse.json({ question: q });
}
