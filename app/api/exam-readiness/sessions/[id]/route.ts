import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const s = examReadinessStore.getSession(id);
	if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ session: s });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await req.json();
	if (body.submit) {
		const s = examReadinessStore.submitSession(id);
		return NextResponse.json({ session: s });
	}
	const s = examReadinessStore.updateSession(id, body);
	if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ session: s });
}
