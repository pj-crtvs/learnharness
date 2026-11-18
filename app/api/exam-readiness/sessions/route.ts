import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const examId = searchParams.get("examId") ?? undefined;
	return NextResponse.json({ sessions: examReadinessStore.listSessions(examId) });
}

export async function POST(req: Request) {
	const body = await req.json();
	const s = examReadinessStore.createSession(body);
	return NextResponse.json({ session: s });
}
