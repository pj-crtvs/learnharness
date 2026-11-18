import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";
import { schedule } from "@/src/core";
import type { Rating } from "@/src/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const { cardId, rating } = body ?? {};
	if (typeof cardId !== "string" || !["again", "hard", "good", "easy"].includes(rating)) {
		return NextResponse.json({ error: "cardId and rating required" }, { status: 400 });
	}
	const card = flashcardStore.getCard(cardId);
	if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
	const updated = schedule(card, rating as Rating);
	flashcardStore.updateCard(cardId, { state: updated.state, scheduling: updated.scheduling });
	flashcardStore.addReview({ cardId, deckId: card.deckId, rating: rating as Rating });
	return NextResponse.json({ card: flashcardStore.getCard(cardId) });
}
