import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ decks: flashcardStore.listDecks() });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const name = typeof body?.name === "string" ? body.name : "Untitled deck";
	const source = body?.source && typeof body.source === "object" ? body.source : undefined;
	const deck = flashcardStore.createDeck(name, source);
	return NextResponse.json({ deck });
}
