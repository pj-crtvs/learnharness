import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const examId = searchParams.get("examId");
	if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });
	const plan = examReadinessStore.getStudyPlan(examId);
	return NextResponse.json({ plan });
}
