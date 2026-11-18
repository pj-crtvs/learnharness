import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const card = flashcardStore.getCard(id);
	if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ card });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	const card = flashcardStore.updateCard(id, body ?? {});
	if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ card });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	flashcardStore.deleteCard(id);
	return NextResponse.json({ ok: true });
}
