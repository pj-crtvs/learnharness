import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const targetId = url.searchParams.get("targetId") ?? undefined;
	return NextResponse.json({ evaluations: knowledgeIntelligenceStore.listAgentEvaluations(targetId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.targetType !== "string" || typeof body?.targetId !== "string" || typeof body?.decision !== "string") {
		return NextResponse.json({ error: "targetType,targetId,decision required" }, { status: 400 });
	}
	const ev = knowledgeIntelligenceStore.createAgentEvaluation({
		targetType: body.targetType,
		targetId: body.targetId,
		decision: body.decision,
		overallQuality: body.overallQuality ?? 0,
		criteria: body.criteria ?? {
			factualAccuracy: 0, relationshipAccuracy: 0, prerequisiteValidity: 0,
			evidenceQuality: 0, logicalConsistency: 0, pedagogicalQuality: 0,
		},
		identifiedErrors: body.identifiedErrors ?? [],
		unsupportedClaims: body.unsupportedClaims ?? [],
		missingEvidence: body.missingEvidence ?? [],
		recommendedChanges: body.recommendedChanges ?? [],
		reasoningSummary: body.reasoningSummary ?? "",
		requiresHumanReview: body.requiresHumanReview ?? false,
	});
	return NextResponse.json({ evaluation: ev });
}