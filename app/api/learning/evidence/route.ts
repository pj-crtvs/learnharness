import { NextResponse } from "next/server";
import { learningStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const skillId = url.searchParams.get("skillId") ?? undefined;
	return NextResponse.json({ evidence: learningStore.listEvidence(skillId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.skillId !== "string") return NextResponse.json({ error: "skillId required" }, { status: 400 });
	const ev = learningStore.addEvidence({
		skillId: body.skillId,
		sourceType: body.sourceType ?? "teaching",
		activityId: body.activityId,
		correct: !!body.correct,
		score: typeof body.score === "number" ? body.score : undefined,
		independent: !!body.independent,
		hintUsed: !!body.hintUsed,
	});
	return NextResponse.json({ evidence: ev, mastery: learningStore.getMastery(body.skillId) });
}
