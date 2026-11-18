import { NextResponse } from "next/server";
import { dostStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	dostStore.ensureQuestions();
	return NextResponse.json({ stats: dostStore.stats() });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.examDate === "string") dostStore.setExamDate(body.examDate);
	return NextResponse.json({ stats: dostStore.stats() });
}
