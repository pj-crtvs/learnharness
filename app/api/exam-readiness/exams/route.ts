import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ exams: examReadinessStore.listExams() });
}

export async function POST(req: Request) {
	const body = await req.json();
	const exam = examReadinessStore.createExam(body);
	return NextResponse.json({ exam });
}
