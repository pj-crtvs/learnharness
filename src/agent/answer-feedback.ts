/**
 * answer-feedback — the Taglish correction the learner reads right after
 * answering (owner, 2026-10-31).
 *
 * The question's own `explanation` is English and written before anyone
 * answered; it can teach the right idea but it cannot say where THIS
 * learner's idea went wrong. So every graded answer gets one extra one-shot
 * call that sees the question, the committed answer, the learner's answer
 * AND the learner's own thinking, and writes a short Taglish correction:
 * name the slip, give the right idea, keep the formulas in English.
 *
 * Laws:
 * - QUESTIONS AND ANSWERS STAY ENGLISH. Only the feedback prose is Taglish;
 *   technical terms and math stay in English/LaTeX.
 * - It is FEEDBACK, never a second grade: the card's verdict is the
 *   client's/teacher's, and this text may not contradict it.
 * - Failure is silent. A timeout or provider error simply leaves the card
 *   without feedback — the answered question is never blocked or delayed
 *   by this call.
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { PiEngine } from "./models.ts";
import type { QuestionAnswerData } from "../core/question-core.ts";
import { runSubagent } from "./subagents/pi-run.ts";

/** What the feedback writer is told about one graded answer. */
export type AnswerFeedbackRequest =
	| {
			kind: "question";
			/** The card's label: Probe / Check / Prediction / Recall / Explain. */
			tool: string;
			question: string;
			options?: string[];
			/** The committed answer, in the question's own words/values. */
			correctAnswer: string;
			/** What the learner chose or typed, verbatim. */
			learnerAnswer: string;
			/** The learner's own reasoning, when they wrote any. */
			learnerThinking?: string;
			/** The client's verdict for graded kinds (absent for explain/recall). */
			verdict?: "correct" | "incorrect" | "unsure";
			/** The author's explanation — context, never to be restated. */
			explanation?: string;
	  }
	| {
			kind: "practice";
			statement: string;
			/** The teacher's committed solution (revealed after submission). */
			modelSolution: string;
			/** The learner's submitted working/answer. */
			learnerAnswer: string;
	  };

/** The Taglish doctrine. Short, specific, and honest about the verdict. */
export const FEEDBACK_SYSTEM_PROMPT = `Ikaw ang tutor na nagbibigay ng feedback pagkatapos sumagot ng estudyante. Magsalita ka sa natural na Taglish: Tagalog/Filipino ang paliwanag, English ang technical terms, formulas, at math.

Rules:
- 2 to 4 sentences. Diretso at specific — walang filler, walang "great job".
- Kung mali ang idea: sabihin sa isang sentence kung ano ang tama/mali, tapos ituro ang EKSAKTONG step o assumption na nag-cause ng pagkakamali sa reasoning niya. Huwag lang sabihin "mali" — ipakita kung saan lumiko ang idea.
- Kung tama: sabihin kung bakit tama at anong intuition ang dapat niyang dalhin sa susunod.
- Kung "I don't know": ibigay ang pinaka-simple na tamang idea, hindi ang buong derivation.
- Gamitin ang "$...$" sa lahat ng math (e.g. $2x\\cos(x^2)$). English ang formulas at technical terms.
- Huwag ulitin ang buong tanong at huwag magpose ng bagong tanong.
- Huwag magbigay ng grade o porsyento; ang verdict ay nasa app.
- Plain prose lamang — walang JSON, walang headings.`;

/** Render the payload the feedback writer sees. The learner's words ride
 *  verbatim; the committed answer is the source of truth. */
export function feedbackPrompt(request: AnswerFeedbackRequest): string {
	if (request.kind === "practice") {
		return JSON.stringify(
			{
				problem: request.statement,
				committed_solution: request.modelSolution,
				learner_submission: request.learnerAnswer,
				write: "Taglish feedback on this submission: where the reasoning went right or wrong, and the correct idea.",
			},
			null,
			2,
		);
	}
	return JSON.stringify(
		{
			tool: request.tool,
			question: request.question,
			...(request.options?.length ? { options: request.options } : {}),
			committed_answer: request.correctAnswer,
			learner_answer: request.learnerAnswer,
			...(request.learnerThinking ? { learner_thinking: request.learnerThinking } : {}),
			...(request.verdict ? { verdict: request.verdict } : {}),
			...(request.explanation ? { author_explanation: request.explanation } : {}),
			write: "Taglish feedback on this answer: correct or not, where the learner's idea went wrong, and the right idea.",
		},
		null,
		2,
	);
}

export interface AnswerFeedbackResult {
	text: string;
}

/** The committed correct answer in display words: the option labels the
 *  correct indices point at (1-based, as `buildAnswer` records them), or
 *  the explain/recall commitment. Falls back to the tool call's raw
 *  correctAnswer values for pre-snapshot records. */
function correctAnswerText(answer: QuestionAnswerData, rawCorrect: unknown): string {
	if (typeof answer.committed === "string" && answer.committed.trim()) return answer.committed.trim();
	const options = answer.options ?? [];
	const indices = answer.correctIndices ?? [];
	const labels = indices
		.map((i) => options.find((o) => o.index === i)?.label)
		.filter((label): label is string => typeof label === "string" && label.length > 0);
	if (labels.length > 0) return labels.join("; ");
	if (Array.isArray(rawCorrect)) return rawCorrect.map(String).join("; ");
	if (typeof rawCorrect === "string") return rawCorrect;
	return "(not recorded)";
}

/** What the learner actually said, in one line for the feedback writer. */
function learnerAnswerText(answer: QuestionAnswerData): string {
	if (answer.dontKnow) return "I don't know";
	const picked = (answer.answers ?? []).map((a) => a.label).filter(Boolean);
	if (picked.length > 0) return picked.join(", ");
	if (answer.text?.trim()) return answer.text.trim();
	if (answer.other?.trim()) return answer.other.trim();
	return "(no answer recorded)";
}

/** Build the feedback request for a GRADED question answer (probe/quiz/
 *  recall/explain). Returns null for ask (ungraded) and dismissals. The
 *  raw tool-call input only supplies a legacy fallback for the committed
 *  answer; everything else comes from the answer snapshot. */
export function questionFeedbackRequest(
	answer: QuestionAnswerData,
	callInput?: unknown,
): AnswerFeedbackRequest | null {
	if (answer.kind === "ask" || answer.dismissed) return null;
	const raw = (callInput ?? {}) as { correctAnswer?: unknown };
	const tool = answer.tool ?? (answer.kind === "quiz" ? "quiz" : "explain");
	const verdict =
		answer.kind === "quiz" ? (answer.dontKnow ? "unsure" : answer.correct ? "correct" : "incorrect") : undefined;
	return {
		kind: "question",
		tool,
		question: answer.questionText,
		options: answer.options?.map((o) => o.label),
		correctAnswer: correctAnswerText(answer, raw.correctAnswer),
		learnerAnswer: learnerAnswerText(answer),
		learnerThinking: answer.thinking ?? answer.note,
		...(verdict ? { verdict } : {}),
		explanation: answer.explanation,
	};
}

/** Build the feedback request for a practice submission. The problem call
 *  carries the statement and the committed model solution. */
export function practiceFeedbackRequest(
	problemInput: unknown,
	learnerText: string,
): AnswerFeedbackRequest | null {
	const input = (problemInput ?? {}) as { statement?: unknown; modelSolution?: unknown };
	const statement = typeof input.statement === "string" ? input.statement.trim() : "";
	const modelSolution = typeof input.modelSolution === "string" ? input.modelSolution.trim() : "";
	if (!statement || !modelSolution || !learnerText.trim()) return null;
	return { kind: "practice", statement, modelSolution, learnerAnswer: learnerText.trim() };
}

/** One fresh one-shot call. Any failure returns null — never a throw into
 *  the answer path (feedback is an enhancement, not a gate). */
export async function generateAnswerFeedback(
	engine: PiEngine,
	request: AnswerFeedbackRequest,
	opts: { signal?: AbortSignal; onUsage?: (usage: Usage) => void; timeoutMs?: number } = {},
): Promise<AnswerFeedbackResult | null> {
	const timeoutMs = opts.timeoutMs ?? 45_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onParentAbort = () => controller.abort();
	opts.signal?.addEventListener("abort", onParentAbort, { once: true });
	if (opts.signal?.aborted) controller.abort();
	try {
		const run = await runSubagent([], {
			role: "teacher",
			engine,
			systemPrompt: FEEDBACK_SYSTEM_PROMPT,
			prompt: feedbackPrompt(request),
			maxTurns: 1,
			abortSignal: controller.signal,
			onUsage: opts.onUsage,
		});
		const text = run.text.trim();
		return text.length > 0 ? { text } : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener("abort", onParentAbort);
	}
}
