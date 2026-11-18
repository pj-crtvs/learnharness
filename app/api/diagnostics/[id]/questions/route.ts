import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return NextResponse.json({ questions: knowledgeIntelligenceStore.listDiagnosticQuestions(id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	if (typeof body?.conceptId !== "string" || typeof body?.prompt !== "string") {
		return NextResponse.json({ error: "conceptId,prompt required" }, { status: 400 });
	}
	const q = knowledgeIntelligenceStore.createDiagnosticQuestion({
		sessionId: id,
		conceptId: body.conceptId,
		level: body.level ?? 2,
		prompt: body.prompt,
		expectedAnswer: body.expectedAnswer,
	});
	return NextResponse.json({ question: q });
}