import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";
import { settingsStore } from "@/src/server";
import { resolveRoleSpec } from "@/src/core";
import { piEngineForSpec } from "@/src/server";
import { runSubagent } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const text = typeof body?.text === "string" ? body.text : "";
	const documentName = typeof body?.name === "string" ? body.name : "Untitled document";
	const count = Math.min(40, Math.max(1, Number(body?.count) || 12));
	let deckId = typeof body?.deckId === "string" ? body.deckId : undefined;
	if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

	const settings = settingsStore.readSettings();
	const spec = resolveRoleSpec("researcher", settings);
	if (!spec) return NextResponse.json({ error: "models not configured" }, { status: 503 });
	const engine = piEngineForSpec(spec, true);

	if (!deckId) {
		const deck = flashcardStore.createDeck(documentName, { kind: "pdf", name: documentName });
		deckId = deck.id;
	}

	// chunk text to avoid huge prompts
	const chunk = text.slice(0, 12000);
	const prompt = `You are generating high-quality study flashcards from the source document below.

Generate exactly ${count} flashcards as a JSON array. Each item: {"front": "...", "back": "...", "kind": "qa"|"definition"|"cloze"|"formula"|"comparison"|"process", "page": number|null}.

Rules:
- Ground every card in the source. No invented facts.
- Questions must be self-contained and not leak the answer.
- Preserve math notation as plain text/LaTeX.
- Avoid duplicates.
- Include page references when possible.

SOURCE (${documentName}):
${chunk}

Return ONLY the JSON array, no prose.`;

	let raw = "";
	try {
		const result = await runSubagent([], {
			role: "researcher",
			engine,
			systemPrompt: "You generate flashcards. Return only valid JSON.",
			messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] as any,
			maxTurns: 1,
		});
		raw = result.text ?? "";
	} catch (err) {
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}

	let parsed: Array<{ front: string; back: string; kind?: string; page?: number | null }> = [];
	try {
		const match = raw.match(/\[[\s\S]*\]/);
		parsed = JSON.parse(match ? match[0] : raw);
	} catch {
		return NextResponse.json({ error: "model did not return valid JSON", raw }, { status: 500 });
	}

	const cards = [];
	for (const item of parsed) {
		if (!item?.front || !item?.back) continue;
		const card = flashcardStore.addCard({
			deckId: deckId!,
			front: String(item.front),
			back: String(item.back),
			kind: (item.kind as any) ?? "qa",
			sourceRef: { document: documentName, page: item.page ?? undefined },
		});
		cards.push(card);
	}
	return NextResponse.json({ deckId, cards });
}
