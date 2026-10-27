/**
 * Extraction coverage — the pure core. THE TEACHER'S PROSE IS THE UNIT
 * (owner ruling, 2026-09-28): the extractor sees ONLY the teacher agent's
 * text blocks — no learner messages, no thinking, no tool calls or
 * results, no quiz blocks. Everything else is INVISIBLE to coverage: it
 * neither opens nor joins a run, so answering a quiz or editing a learner
 * message triggers nothing. "Covered" is by construction exactly "what
 * the extractor saw": the fingerprint (sha256 of a message's view lines)
 * and the extractor's prompt share ONE selection — the teacher prose.
 *
 * A per-chat append-only ledger records which messages have been
 * extracted by CONTENT FINGERPRINT; "uncovered" is DERIVED at read time
 * (fingerprint the current transcript, diff against the ledger) — never
 * dual-tracked. Runs are token-budgeted batches of the oldest uncovered
 * teacher-prose messages: greedy consecutive fill, a message is never
 * split, a single over-budget message rides alone. (The old
 * inseparability bond — call + results in one chunk — died with the
 * ruling: tool results are invisible now, so nothing needs keeping
 * together.)
 */

import { createHash } from "node:crypto";

import type { CoverageEntry } from "./contracts/graph.ts";
import type { LhMessage } from "./native-messages.ts";
import { gradedQuestionContent } from "./question-content.ts";

export type { CoverageEntry };

/** The user-facing text of a native message (string or text blocks). */
function textOf(content: unknown): string[] {
	if (typeof content === "string") return content.trim() ? [content] : [];
	if (!Array.isArray(content)) return [];
	return content
		.filter((c): c is { type: "text"; text: string } => (c as { type?: string }).type === "text")
		.map((c) => c.text)
		.filter((t) => t.trim().length > 0);
}

/**
 * The extraction-relevant lines of ONE native message — the shared seam
 * between the extractor's prompt and messageFingerprint (coverage).
 * TEACHER PROSE ONLY (owner, 2026-09-28): an assistant message yields one
 * line per text block; everything else (user messages, tool results,
 * markers) yields NOTHING and is invisible to coverage. `mid` is the
 * message id — part of the hash input, so the same prose in two messages
 * is two slots (per-message coverage).
 */
export function messageViewLines(message: LhMessage, mid: string): string[] {
	const lines: string[] = [];
	if ((message as { role?: string }).role !== "assistant") return lines;
	for (const text of textOf((message as { content: unknown }).content)) {
		lines.push(`TEACHER [${mid}] ${text.trim()}`);
	}
	return lines;
}

// ─── the question-content view (tool-only chats, owner 2026-10-27) ──────────
//
// Some lessons are taught entirely through graded question calls — the
// teacher's text blocks are empty, so the prose-only view has nothing to
// extract and the chat never enters the graph. The fallback view below gives
// those messages a knowledge-bearing face: the question, the teacher's
// committed answer, and the explanation. It is used ONLY for chats with zero
// teacher prose (chatCoverageOf); prose chats keep the 2026-09-28 ruling
// byte-for-byte.
//
// Only STRUCTURALLY VALID graded calls enter the view. Rejected calls (the
// model retried them) are not knowledge. Semantic validation happens in the
// extraction pipeline before this view is sent — see extraction.ts.

/**
 * The question-content lines of a prose-less message. Returns [] when the
 * message carries teacher prose (those chats use the prose view) or no valid
 * graded call. Same shape as messageViewLines: one string per extractable
 * passage, labelled with the message id.
 */
export function questionViewLines(message: LhMessage, mid: string): string[] {
	if (messageViewLines(message, mid).length > 0) return [];
	const lines: string[] = [];
	for (const content of gradedQuestionContent(message)) {
		lines.push(`TEACHER QUESTION [${mid}] ${content.question}`);
		lines.push(`ANSWER: ${content.correctLabels.join("; ")}`);
		if (content.explanation) lines.push(`WHY: ${content.explanation}`);
	}
	return lines;
}

/** The question-content fingerprint: distinct namespace from the prose
 *  fingerprint (a message may have both views, and they must never collide). */
export function questionFingerprint(message: LhMessage): string {
	const h = createHash("sha256");
	h.update(JSON.stringify(["question", (message as { role?: string }).role, questionViewLines(message, message.id)]));
	return h.digest("hex");
}

/**
 * The teacher's prose blocks of a transcript, in order — the extractor's
 * prompt material. SAME selection as messageViewLines (the parity
 * doctrine survives the ruling in this one function pair), rendered
 * without the provenance prefix: plain paragraphs.
 */
export function teacherProseBlocks(messages: ReadonlyArray<LhMessage>): string[] {
	const out: string[] = [];
	for (const message of messages) {
		if ((message as { role?: string }).role !== "assistant") continue;
		for (const text of textOf((message as { content: unknown }).content)) out.push(text.trim());
	}
	return out;
}

/** Tokens of a message's view — chars/4, ceil, the app-wide estimate. */
export function viewTokens(lines: string[]): number {
	return Math.ceil(lines.join("\n").length / 4);
}

/**
 * A message's coverage fingerprint: sha256 of role + its view lines (the
 * teacher prose, with the message id as the tag). Changes exactly when
 * the teacher prose of the message changes — nothing else can re-open it.
 */
export function messageFingerprint(message: LhMessage): string {
	const h = createHash("sha256");
	h.update(JSON.stringify([(message as { role?: string }).role, messageViewLines(message, message.id)]));
	return h.digest("hex");
}

/** One message's coverage-relevant projection. `view` distinguishes the
 *  prose channel from the question-content fallback; `lines` is the exact
 *  view the extractor receives (empty = invisible to coverage). */
export interface CoverageSlot {
	message: LhMessage;
	fp: string;
	tokens: number;
	view: "prose" | "question";
	lines: string[];
}

/** Fingerprint a whole transcript, in order (used by the trigger, the run,
 *  and the coverage view — one derivation everywhere). */
export function coverageSlots(messages: ReadonlyArray<LhMessage>): CoverageSlot[] {
	return messages.map((message) => {
		const lines = messageViewLines(message, message.id);
		return { message, fp: messageFingerprint(message), tokens: viewTokens(lines), view: "prose" as const, lines };
	});
}

/** The question-content fallback slots (only prose-less messages with a valid
 *  graded call). */
export function questionCoverageSlots(messages: ReadonlyArray<LhMessage>): CoverageSlot[] {
	const out: CoverageSlot[] = [];
	for (const message of messages) {
		const lines = questionViewLines(message, message.id);
		if (lines.length === 0) continue;
		out.push({
			message,
			fp: questionFingerprint(message),
			tokens: viewTokens(lines),
			view: "question",
			lines,
		});
	}
	return out;
}

/** The covered-fingerprint set for one chat, from the ledger. */
export function coveredSet(entries: ReadonlyArray<CoverageEntry>, chatId: string): Set<string> {
	const out = new Set<string>();
	for (const e of entries) if (e.chatId === chatId) out.add(e.fp);
	return out;
}

/** The derived state: which slots are uncovered, plus the token totals.
 *  "Uncovered" needs no ledger of its own — this diff IS the coverage view.
 *  `uncovered` is INDEXES into `slots` (the batcher batches by position).
 *  Messages with NO view lines — every learner message, every tool result,
 *  markers, prose-less assistant turns — are invisible to coverage
 *  entirely: the extractor can never see them, so they are neither covered
 *  nor uncovered. */
export function coverageOf(
	messages: ReadonlyArray<LhMessage>,
	entries: ReadonlyArray<CoverageEntry>,
	chatId: string,
): CoverageOf {
	return coverageOfSlots(coverageSlots(messages), entries, chatId);
}

/** The question-content fallback, diffed against the SAME per-chat ledger
 *  (fingerprints are namespaced, so prose and question coverage can never
 *  alias each other). */
export function questionCoverageOf(
	messages: ReadonlyArray<LhMessage>,
	entries: ReadonlyArray<CoverageEntry>,
	chatId: string,
): CoverageOf {
	return coverageOfSlots(questionCoverageSlots(messages), entries, chatId);
}

export interface CoverageOf {
	slots: CoverageSlot[];
	uncovered: number[];
	coveredTokens: number;
	uncoveredTokens: number;
	coveredCount: number;
	uncoveredCount: number;
}

function coverageOfSlots(slots: CoverageSlot[], entries: ReadonlyArray<CoverageEntry>, chatId: string): CoverageOf {
	const covered = coveredSet(entries, chatId);
	const uncovered: number[] = [];
	let coveredTokens = 0;
	let uncoveredTokens = 0;
	for (let i = 0; i < slots.length; i++) {
		const slot = slots[i]!;
		if (slot.lines.length === 0) continue; // invisible
		if (covered.has(slot.fp)) coveredTokens += slot.tokens;
		else {
			uncovered.push(i);
			uncoveredTokens += slot.tokens;
		}
	}
	const visibleCount = slots.filter((s) => s.lines.length > 0).length;
	return {
		slots,
		uncovered,
		coveredTokens,
		uncoveredTokens,
		coveredCount: visibleCount - uncovered.length,
		uncoveredCount: uncovered.length,
	};
}

/**
 * THE PER-CHAT DERIVATION (owner, 2026-10-27): a chat with ANY teacher prose
 * uses the prose channel exactly as before; a chat with NO prose (a lesson
 * taught entirely through graded question calls) falls back to the
 * question-content channel. The two channels never mix, so the prose ruling
 * survives untouched for normal lessons.
 */
export function chatCoverageOf(
	messages: ReadonlyArray<LhMessage>,
	entries: ReadonlyArray<CoverageEntry>,
	chatId: string,
): CoverageOf {
	const prose = coverageOf(messages, entries, chatId);
	if (prose.slots.some((slot) => slot.view === "prose" && slot.lines.length > 0)) return prose;
	return questionCoverageOf(messages, entries, chatId);
}

/**
 * Batch the uncovered teacher-prose messages into token-budgeted RUNS:
 * consecutive slots, oldest first, greedy fill — a message is never split.
 * A single message larger than the budget becomes its own (over-budget)
 * run rather than being dropped. Runs are ephemeral — the durable record
 * is per-message coverage, checkpointed after each run merges.
 */
export function batchRuns(slots: ReadonlyArray<CoverageSlot>, uncovered: ReadonlyArray<number>, budget: number): CoverageSlot[][] {
	if (budget <= 0 || uncovered.length === 0) return [];
	const runs: CoverageSlot[][] = [];
	let current: CoverageSlot[] = [];
	let currentTokens = 0;
	const flush = () => {
		if (current.length > 0) runs.push(current);
		current = [];
		currentTokens = 0;
	};
	for (const i of uncovered) {
		const slot = slots[i]!;
		if (current.length > 0 && currentTokens + slot.tokens > budget) flush();
		current.push(slot);
		currentTokens += slot.tokens;
	}
	flush();
	return runs;
}

/**
 * A batch's deterministic tag: hash of its member fingerprints. This is the
 * observation-ref prefix for the run (obs:<tag>:<sourceId> in the merger):
 * re-running the SAME batch (crash recovery) produces the same refs and
 * dedupes; a re-opened (mutated) message changes the tag, so its fresh
 * understanding observations land as new events — the most-recent fold
 * sees the update. Run-local source ids ("p1"…) alone could never do this:
 * their positions shift between runs.
 */
export function batchTag(batch: ReadonlyArray<CoverageSlot>): string {
	const h = createHash("sha256");
	for (const slot of batch) h.update(slot.fp);
	return h.digest("hex").slice(0, 12);
}
