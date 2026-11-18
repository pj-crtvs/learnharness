import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = knowledgeIntelligenceStore.getDiagnosticSession(id);
	if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
	const questions = knowledgeIntelligenceStore.listDiagnosticQuestions(id);
	const responses = knowledgeIntelligenceStore.listDiagnosticResponses(id);
	const hypotheses = knowledgeIntelligenceStore.listHypotheses(id);
	return NextResponse.json({ session, questions, responses, hypotheses });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	const session = knowledgeIntelligenceStore.updateDiagnosticSession(id, body);
	if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ session });
}