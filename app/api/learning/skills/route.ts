import { NextResponse } from "next/server";
import { learningStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ skills: learningStore.listSkills(), stats: learningStore.stats() });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.name !== "string" || typeof body?.domain !== "string") return NextResponse.json({ error: "name,domain required" }, { status: 400 });
	const skill = learningStore.createSkill({ name: body.name, domain: body.domain, parentId: body.parentId, description: body.description });
	return NextResponse.json({ skill });
}
