import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	const body = await req.json();
	const { examId, count } = body;
	const qs = examReadinessStore.generateQuestions(examId, count ?? 10);
	return NextResponse.json({ questions: qs });
}
