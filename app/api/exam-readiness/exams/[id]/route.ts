import { NextResponse } from "next/server";
import { examReadinessStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const exam = examReadinessStore.getExam(id);
	if (!exam) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ exam });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await req.json();
	const exam = examReadinessStore.updateExam(id, body);
	if (!exam) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ exam });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const ok = examReadinessStore.deleteExam(id);
	return NextResponse.json({ deleted: ok });
}
