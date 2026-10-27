/**
 * question-content — the pure bridge between a persisted graded tool call and
 * the two consumers that need its knowledge face:
 *
 *   - core/coverage.ts (the tool-only chat fallback: what the extractor sees)
 *   - agent/question-verify.ts (the independent answer check)
 *
 * Only STRUCTURALLY VALID calls are returned. A rejected call (the model's
 * invalid first attempt, which the teacher retried) is not knowledge and
 * must never enter either channel. Semantic correctness is the verifier's
 * job, not this module's.
 *
 * No framework imports, no node builtins: safe for both layers.
 */

import type { LhMessage } from "./native-messages.ts";
import {
	coerceCorrectAnswer,
	explainInputProblems,
	parseOptionsIfString,
	quizInputProblems,
} from "./question-core.ts";

export interface GradedQuestionContent {
	kind: "choice" | "free";
	question: string;
	correctAnswer: string | string[];
	/** The answer resolved to display labels (choice) or the committed text
	 *  (free) — the extractor's readable face. */
	correctLabels: string[];
	options?: Array<{ label: string; value: string }>;
	multiSelect?: boolean;
	explanation?: string;
	details?: string;
}

interface ToolCallPart {
	type?: unknown;
	name?: unknown;
	arguments?: unknown;
}

function parsedArguments(raw: unknown): Record<string, unknown> | null {
	let value = raw;
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/** Every structurally valid graded question carried by one message. */
export function gradedQuestionContent(message: LhMessage): GradedQuestionContent[] {
	if ((message as { role?: string }).role !== "assistant") return [];
	const content = (message as { content?: unknown }).content;
	if (!Array.isArray(content)) return [];
	const out: GradedQuestionContent[] = [];
	for (const part of content as ToolCallPart[]) {
		if (part.type !== "toolCall" || typeof part.name !== "string") continue;
		const name = part.name;
		if (name !== "quiz" && name !== "probe" && name !== "explain" && name !== "recall") continue;
		const args = parsedArguments(part.arguments);
		if (!args) continue;
		const question = typeof args.question === "string" ? args.question.trim() : "";
		if (!question) continue;

		if (name === "quiz" || name === "probe") {
			const optionsRaw = parseOptionsIfString(
				args.options as string | Array<{ label: string; value?: string }> | undefined,
			);
			if (!Array.isArray(optionsRaw)) continue;
			const options = (optionsRaw as Array<{ label: string; value?: string }>)
				.filter((o) => typeof o?.label === "string")
				.map((o) => ({ label: o.label.trim(), value: o.value?.trim() || o.label.trim() }));
			const correctAnswer = args.correctAnswer;
			if (typeof correctAnswer !== "string" && !Array.isArray(correctAnswer)) continue;
			const multiSelect = args.multiSelect === true;
			if (quizInputProblems({ options, correctAnswer, multiSelect }).length > 0) continue;
			const keys = options.map((o) => o.value);
			const values = coerceCorrectAnswer(correctAnswer, keys);
			const correctLabels = values.map((value) => options.find((o) => o.value === value)?.label ?? value);
			out.push({
				kind: "choice",
				question,
				correctAnswer,
				correctLabels,
				options,
				multiSelect,
				explanation: typeof args.explanation === "string" ? args.explanation.trim() : undefined,
				details: typeof args.details === "string" ? args.details.trim() : undefined,
			});
			continue;
		}

		const correctAnswer = typeof args.correctAnswer === "string" ? args.correctAnswer.trim() : "";
		if (explainInputProblems({ correctAnswer }).length > 0) continue;
		out.push({
			kind: "free",
			question,
			correctAnswer,
			correctLabels: [correctAnswer],
			details: typeof args.details === "string" ? args.details.trim() : undefined,
		});
	}
	return out;
}
