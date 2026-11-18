import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

export type CardState = "new" | "learning" | "review" | "relearning";

export interface CardScheduling {
	due: string;
	stability: number;
	difficulty: number;
	reps: number;
	lapses: number;
	lastReview?: string;
	step?: number;
}

export interface Flashcard {
	id: string;
	deckId: string;
	front: string;
	back: string;
	kind: "qa" | "definition" | "cloze" | "formula" | "comparison" | "process";
	sourceRef?: { document: string; page?: number };
	state: CardState;
	scheduling: CardScheduling;
	createdAt: string;
	updatedAt: string;
}

export interface Deck {
	id: string;
	name: string;
	source?: { kind: "pdf"; name: string };
	createdAt: string;
	updatedAt: string;
}

export interface ReviewLog {
	id: string;
	cardId: string;
	deckId: string;
	rating: "again" | "hard" | "good" | "easy";
	reviewedAt: string;
}

interface StoreData {
	decks: Deck[];
	cards: Flashcard[];
	reviews: ReviewLog[];
}

const FILE = path.join(PATHS.data, "flashcards.json");

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		return { decks: parsed.decks ?? [], cards: parsed.cards ?? [], reviews: parsed.reviews ?? [] };
	} catch {
		return { decks: [], cards: [], reviews: [] };
	}
}

function save(data: StoreData): void {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function now(): string {
	return new Date().toISOString();
}

function makeId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const flashcardStore = {
	listDecks(): Deck[] {
		return load().decks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	},
	getDeck(id: string): Deck | null {
		return load().decks.find((d) => d.id === id) ?? null;
	},
	createDeck(name: string, source?: Deck["source"]): Deck {
		const data = load();
		const deck: Deck = { id: makeId("deck"), name: name.trim() || "Untitled deck", source, createdAt: now(), updatedAt: now() };
		data.decks.push(deck);
		save(data);
		return deck;
	},
	renameDeck(id: string, name: string): Deck | null {
		const data = load();
		const deck = data.decks.find((d) => d.id === id);
		if (!deck) return null;
		deck.name = name.trim() || deck.name;
		deck.updatedAt = now();
		save(data);
		return deck;
	},
	deleteDeck(id: string): void {
		const data = load();
		data.decks = data.decks.filter((d) => d.id !== id);
		data.cards = data.cards.filter((c) => c.deckId !== id);
		data.reviews = data.reviews.filter((r) => r.deckId !== id);
		save(data);
	},
	listCards(deckId?: string): Flashcard[] {
		const data = load();
		const cards = deckId ? data.cards.filter((c) => c.deckId === deckId) : data.cards;
		return cards.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	},
	getCard(id: string): Flashcard | null {
		return load().cards.find((c) => c.id === id) ?? null;
	},
	addCard(card: { deckId: string; front: string; back: string; kind: Flashcard["kind"]; sourceRef?: Flashcard["sourceRef"]; state?: CardState; scheduling?: CardScheduling }): Flashcard {
		const data = load();
		const nowStr = now();
		const newCard: Flashcard = {
			id: makeId("card"),
			deckId: card.deckId,
			front: card.front,
			back: card.back,
			kind: card.kind,
			sourceRef: card.sourceRef,
			state: card.state ?? "new",
			scheduling: card.scheduling ?? { due: nowStr, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
			createdAt: nowStr,
			updatedAt: nowStr,
		};
		data.cards.push(newCard);
		save(data);
		return newCard;
	},
	updateCard(id: string, patch: Partial<Pick<Flashcard, "front" | "back" | "kind" | "sourceRef" | "state" | "scheduling">>): Flashcard | null {
		const data = load();
		const card = data.cards.find((c) => c.id === id);
		if (!card) return null;
		Object.assign(card, patch, { updatedAt: now() });
		save(data);
		return card;
	},
	deleteCard(id: string): void {
		const data = load();
		data.cards = data.cards.filter((c) => c.id !== id);
		data.reviews = data.reviews.filter((r) => r.cardId !== id);
		save(data);
	},
	moveCard(cardId: string, deckId: string): Flashcard | null {
		const data = load();
		const card = data.cards.find((c) => c.id === cardId);
		if (!card) return null;
		card.deckId = deckId;
		card.updatedAt = now();
		save(data);
		return card;
	},
	addReview(log: { cardId: string; deckId: string; rating: ReviewLog["rating"] }): ReviewLog {
		const data = load();
		const entry: ReviewLog = { id: makeId("rev"), cardId: log.cardId, deckId: log.deckId, rating: log.rating, reviewedAt: now() };
		data.reviews.push(entry);
		save(data);
		return entry;
	},
	listReviews(deckId?: string): ReviewLog[] {
		const data = load();
		const r = deckId ? data.reviews.filter((x) => x.deckId === deckId) : data.reviews;
		return r.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
	},
	stats() {
		const data = load();
		const nowStr = new Date().toISOString();
		const counts = { new: 0, learning: 0, review: 0, relearning: 0 };
		for (const c of data.cards) counts[c.state]++;
		const dueToday = data.cards.filter((c) => c.scheduling.due <= nowStr).length;
		const overdue = data.cards.filter((c) => c.scheduling.due < new Date(Date.now() - 86400000).toISOString()).length;
		return { totalCards: data.cards.length, totalDecks: data.decks.length, counts, dueToday, overdue, totalReviews: data.reviews.length };
	},
};
