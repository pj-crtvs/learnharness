import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const deck = flashcardStore.getDeck(id);
	if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });
	const cards = flashcardStore.listCards(id);
	return NextResponse.json({ deck, cards });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = await request.json().catch(() => ({}));
	const deck = flashcardStore.renameDeck(id, typeof body?.name === "string" ? body.name : "");
	if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });
	return NextResponse.json({ deck });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	flashcardStore.deleteDeck(id);
	return NextResponse.json({ ok: true });
}
