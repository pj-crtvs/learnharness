import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const studentId = url.searchParams.get("studentId") ?? undefined;
	return NextResponse.json({ sessions: knowledgeIntelligenceStore.listDiagnosticSessions(studentId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.studentId !== "string" || typeof body?.targetConceptId !== "string") {
		return NextResponse.json({ error: "studentId,targetConceptId required" }, { status: 400 });
	}
	const session = knowledgeIntelligenceStore.createDiagnosticSession({
		studentId: body.studentId,
		targetConceptId: body.targetConceptId,
		status: "open",
		hypotheses: [],
		questionIds: [],
	});
	return NextResponse.json({ session });
}