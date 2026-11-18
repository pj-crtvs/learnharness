import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const studentId = url.searchParams.get("studentId") ?? undefined;
	const conceptId = url.searchParams.get("conceptId") ?? undefined;
	let records = knowledgeIntelligenceStore.listMastery(studentId);
	if (conceptId) records = records.filter((r) => r.conceptId === conceptId);
	return NextResponse.json({ mastery: records });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.studentId !== "string" || typeof body?.conceptId !== "string") {
		return NextResponse.json({ error: "studentId,conceptId required" }, { status: 400 });
	}
	const rec = knowledgeIntelligenceStore.upsertMastery({
		studentId: body.studentId,
		conceptId: body.conceptId,
		state: body.state ?? "introduced",
		conceptual: body.conceptual ?? 0,
		procedural: body.procedural ?? 0,
		independent: body.independent ?? 0,
		retention: body.retention ?? 0,
		application: body.application ?? 0,
		reasoning: body.reasoning ?? 0,
		score: body.score ?? 0,
		confidence: body.confidence ?? "low",
		evidenceCount: body.evidenceCount ?? 0,
		lastValidated: body.lastValidated,
	});
	return NextResponse.json({ mastery: rec });
}