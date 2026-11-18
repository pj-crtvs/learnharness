import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const examId = searchParams.get("examId") ?? undefined;
	const topic = searchParams.get("topic") ?? undefined;
	return NextResponse.json({ attempts: examReadinessStore.listAttempts(examId, topic) });
}

export async function POST(req: Request) {
	const body = await req.json();
	if (Array.isArray(body.attempts)) {
		const attempts = examReadinessStore.recordAttempts(body.attempts);
		return NextResponse.json({ attempts });
	}
	const a = examReadinessStore.recordAttempt(body);
	return NextResponse.json({ attempt: a });
}
