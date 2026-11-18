/**
 * answer-feedback — the SERVER half of the post-answer Taglish correction
 * (owner, 2026-10-31).
 *
 * The answer path fires this immediately after the answer is persisted and
 * keeps going: the teacher's turn runs in parallel, and the feedback lands
 * on the answer's own record message when it resolves. The client learns
 * about it through `record-changed` (notify → fetch), so:
 * - a sibling question still dangling (the parallel-question gate returns
 *   early) shows its feedback as soon as it arrives;
 * - a running turn shows it on the settle refetch (or immediately after,
 *   because the write announces itself);
 * - a failure is silent — the answered card simply has no feedback block,
 *   and nothing about the graded result changes.
 */

import type { CallUsage } from "../core/contracts.ts";
import { emit } from "../core/events.ts";
import type { ChatStore } from "../core/ports.ts";
import type { PiEngine } from "../agent/models.ts";
import { generateAnswerFeedback, type AnswerFeedbackRequest } from "../agent/answer-feedback.ts";

export interface AnswerFeedbackJob {
	chatId: string;
	/** The answer's own record message (toolResult / practice-thinking). */
	messageId: string;
	request: AnswerFeedbackRequest;
}

/** Flatten pi's Usage into the persisted call shape (the money channel's
 *  exact fields — same mapping the chat-handler uses for turn steps). */
function callUsageOf(usage: {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cacheWrite1h?: number;
	reasoning?: number;
}): CallUsage {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		cacheReadTokens: usage.cacheRead,
		cacheWriteTokens: usage.cacheWrite,
		cacheWrite1hTokens: usage.cacheWrite1h ?? 0,
		reasoningTokens: usage.reasoning ?? 0,
	};
}

/** Run one feedback call and attach the result. Never throws into the
 *  answer path — every failure is a silent no-op. */
export async function runAnswerFeedback(
	chatStore: ChatStore,
	engine: PiEngine,
	modelId: string,
	job: AnswerFeedbackJob,
): Promise<void> {
	const calls: CallUsage[] = [];
	let result: Awaited<ReturnType<typeof generateAnswerFeedback>>;
	try {
		result = await generateAnswerFeedback(engine, job.request, {
			onUsage: (usage) => calls.push(callUsageOf(usage)),
		});
	} catch (err) {
		console.error(`[chat ${job.chatId}] answer feedback failed:`, err);
		return;
	}
	if (!result) return;
	try {
		if (!chatStore.attachAnswerFeedback(job.chatId, job.messageId, result.text)) return;
		if (calls.length > 0) {
			chatStore.appendTurnUsage(job.chatId, {
				// Its own id: feedback is a real model call and must be counted
				// once, never folded into the answer turn (whose usage was
				// already appended when its stream settled).
				id: `feedback_${job.messageId}`,
				messageId: job.messageId,
				at: new Date().toISOString(),
				model: modelId,
				steps: calls,
			});
		}
		emit("record-changed", { chatId: job.chatId });
	} catch (err) {
		console.error(`[chat ${job.chatId}] answer feedback persist failed:`, err);
	}
}
