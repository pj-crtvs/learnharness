import { NextResponse } from "next/server";
import { analyzeDiagnosticSession } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const result = analyzeDiagnosticSession(id);
	if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json(result);
}