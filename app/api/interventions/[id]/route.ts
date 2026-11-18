import { NextResponse } from "next/server";
import { knowledgeIntelligenceStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const plan = knowledgeIntelligenceStore.listInterventionPlans().find((p) => p.id === id);
	if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
	const activities = knowledgeIntelligenceStore.listInterventionActivities(id);
	return NextResponse.json({ plan, activities });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	const plan = knowledgeIntelligenceStore.updateInterventionPlan(id, body);
	if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ plan });
}