import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const deckId = url.searchParams.get("deckId") ?? undefined;
	return NextResponse.json({ cards: flashcardStore.listCards(deckId) });
}

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.deckId !== "string" || typeof body?.front !== "string" || typeof body?.back !== "string") {
		return NextResponse.json({ error: "deckId, front, back required" }, { status: 400 });
	}
	const card = flashcardStore.addCard({
		deckId: body.deckId,
		front: body.front,
		back: body.back,
		kind: body.kind ?? "qa",
		sourceRef: body.sourceRef,
	});
	return NextResponse.json({ card });
}
