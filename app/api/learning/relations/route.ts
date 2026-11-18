import { NextResponse } from "next/server";
import { learningStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ relations: learningStore.listRelations() });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.from !== "string" || typeof body?.to !== "string" || typeof body?.type !== "string") return NextResponse.json({ error: "from,to,type required" }, { status: 400 });
	const rel = learningStore.addRelation({ from: body.from, to: body.to, type: body.type });
	return NextResponse.json({ relation: rel });
}
