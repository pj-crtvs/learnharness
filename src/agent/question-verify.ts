/**
 * question-verify — the independent correctness gate for graded questions.
 *
 * Why this exists (owner, 2026-10-27): a structurally valid quiz can still
 * teach a wrong answer (the CSS box-model incident: correctAnswer "250",
 * explanation double-counted padding, the real answer 230 was not even an
 * option). The structural contract in core/question-core.ts cannot catch
 * that — it only checks that the question is gradeable.
 *
 * THE BLIND-SOLVE LAW (owner, 2026-10-27, after the first live run): the
 * solver NEVER sees the committed answer. The first design showed the claim
 * and asked for a verdict; live, the model computed 230 and still emitted
 * "agree" with the committed 250 — anchoring is structural, not a prompt
 * bug. So:
 *
 *   1. SOLVE blind — the question (and options) only. The solver returns its
 *      own answer. For multiple choice, a deterministic answer-set
 *      comparison decides pass/fail; no model verdict is involved.
 *   2. COMPARE (free recall + practice only) — a second one-shot call sees
 *      the blind answer and the committed answer as equal-standing
 *      candidates and judges whether they are equivalent enough to grade
 *      against. Neither is labeled authoritative.
 *
 * Failure law: a disagreement, an unusable reply, a timeout, or a provider
 * error all REJECT the pose. The teacher receives actionable problems as a
 * normal invalid-input tool result and must re-commit. Unverified graded
 * questions never reach the learner.
 */

import type { Usage } from "@earendil-works/pi-ai";
import { coerceCorrectAnswer } from "../core/question-core.ts";
import type { GradedQuestionContent } from "../core/question-content.ts";
import type { PiEngine } from "./models.ts";
import { runSubagent } from "./subagents/pi-run.ts";

/** The three graded shapes the gate understands. `choice` covers probe/quiz;
 *  `free` covers recall/explain; `problem` covers the practice pose. */
export type QuestionVerificationInput =
	| {
			kind: "choice";
			question: string;
			options: Array<{ label: string; value?: string }>;
			correctAnswer: string | string[];
			multiSelect?: boolean;
			explanation?: string;
			details?: string;
	  }
	| {
			kind: "free";
			question: string;
			correctAnswer: string;
			details?: string;
	  }
	| {
			kind: "problem";
			statement: string;
			modelSolution: string;
	  };

/** Adapt a persisted graded call (core/question-content) to the verifier's
 *  input. Used by the extraction-time gate over historical question slots. */
export function verificationInputFromContent(content: GradedQuestionContent): QuestionVerificationInput {
	if (content.kind === "choice") {
		return {
			kind: "choice",
			question: content.question,
			options: content.options ?? [],
			correctAnswer: content.correctAnswer,
			multiSelect: content.multiSelect,
			explanation: content.explanation,
			details: content.details,
		};
	}
	return {
		kind: "free",
		question: content.question,
		correctAnswer: content.correctAnswer as string,
		details: content.details,
	};
}

export type QuestionVerificationResult =
	| { ok: true }
	| { ok: false; problems: string[] };

export interface QuestionVerifier {
	verify(
		input: QuestionVerificationInput,
		opts?: { signal?: AbortSignal; onUsage?: (usage: Usage) => void },
	): Promise<QuestionVerificationResult>;
}

/** The blind solver's doctrine. It is told nothing about a proposed answer:
 *  a solver that knows the "expected" answer can rationalize toward it. */
export const SOLVER_SYSTEM_PROMPT = `You are an independent solver for a learning app. You will be given a question and nothing else about it. There is no known answer; do not assume any option is correct.

Method:
1. Work the problem out yourself — compute, derive, or recall the facts.
2. Answer exactly as the question asks. Use the same units and precision as the question.
3. Keep "reason" to at most TWO short sentences: the decisive computation or fact, not a full essay.
4. If the question is ambiguous, underspecified, or cannot be answered, say so in "reason" and give your best answer anyway.

For a multiple-choice question:
- "answer" lists the option VALUE strings you found correct (for example ["230"], not the label if the label differs). Include every correct option for a multiple-select question.
- If the true answer is not among the options, put the true answer in "answer" and say so explicitly in "reason".

For a free-recall question: "answer" is a one-element array with the correct answer as you would grade it.

For a practice problem: "answer" is a one-element array with the complete worked solution.

Return ONLY a JSON object, no prose outside it:
{"answer":["..."],"reason":"..."}`;

/** The comparison call (free recall + practice only): two candidates of
 *  equal standing, never told which one a teacher wrote. */
export const COMPARE_SYSTEM_PROMPT = `You compare two candidate answers to the same question. Neither is authoritative — they are labeled A and B only.

Decide whether they are equivalent enough to grade against: the same facts, the same result, the same required reasoning. Wording, notation, and extra detail may differ; the substance must match. If they disagree on a fact or result, say which candidate is correct.

Return ONLY a JSON object, no prose outside it:
{"verdict":"same"|"different","which":"A"|"B"|"both"|"neither","reason":"..."}

"which" names the candidate whose substance is correct: "both" when equivalent, "A"/"B" when they differ, "neither" when both are wrong. "reason" is one or two sentences a teacher can act on.`;

/** Render the blind solver's prompt. It must never contain the committed
 *  answer, the explanation, or any framing that hints at one. */
export function solverPrompt(input: QuestionVerificationInput): string {
	if (input.kind === "choice") {
		return JSON.stringify(
			{
				question: input.question,
				options: input.options.map((o, i) => ({
					index: i,
					label: o.label,
					value: o.value?.trim() || o.label.trim(),
				})),
				learner_instructions: input.details ?? "",
			},
			null,
			2,
		);
	}
	if (input.kind === "free") {
		return JSON.stringify(
			{
				question: input.question,
				learner_instructions: input.details ?? "",
			},
			null,
			2,
		);
	}
	return JSON.stringify({ problem: input.statement }, null, 2);
}

/** The committed answer as the comparison call sees it. */
function committedAnswerOf(input: Exclude<QuestionVerificationInput, { kind: "choice" }>): string {
	return input.kind === "free" ? input.correctAnswer : input.modelSolution;
}

/** Render the comparison prompt: the question, then A = the committed
 *  answer and B = the blind solver's answer, with no authority framing. */
export function comparePrompt(
	input: Exclude<QuestionVerificationInput, { kind: "choice" }>,
	candidate: string,
): string {
	const question = input.kind === "problem" ? input.statement : input.question;
	return JSON.stringify(
		{
			question,
			candidate_A: committedAnswerOf(input),
			candidate_B: candidate,
			...(input.kind === "free" && input.details ? { learner_instructions: input.details } : {}),
		},
		null,
		2,
	);
}

export interface SolverReply {
	answer: string[];
	reason: string;
}

export interface CompareReply {
	verdict: "same" | "different";
	which: "A" | "B" | "both" | "neither";
	reason: string;
}

/**
 * Every balanced top-level JSON object in a model reply, in order. Models
 * occasionally narrate, self-correct, then re-emit JSON (the live verifier
 * did exactly that) — taking the LAST valid object is what makes that
 * output usable instead of a hard failure. String-aware so braces inside
 * answers never unbalance the scan.
 */
export function jsonObjects(text: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = -1;
	let inString = false;
	let escaped = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === "}") {
			if (depth > 0) {
				depth--;
				if (depth === 0 && start >= 0) {
					out.push(text.slice(start, i + 1));
					start = -1;
				}
			}
		}
	}
	return out;
}

function parseObjects<T>(text: string, validate: (value: unknown) => T | null): T | null {
	const objects = jsonObjects(text.trim());
	for (let i = objects.length - 1; i >= 0; i--) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(objects[i]!);
		} catch {
			continue;
		}
		const valid = validate(parsed);
		if (valid) return valid;
	}
	return null;
}

function stringList(value: unknown): string[] {
	if (typeof value === "string") return [value.trim()].filter(Boolean);
	if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim()) out.push(item.trim());
		else if (typeof item === "number" && Number.isFinite(item)) out.push(String(item));
	}
	return out;
}

/** The blind solver's reply. An empty answer is unusable (fail closed). */
export function parseSolverReply(text: string): SolverReply | null {
	return parseObjects(text, (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		const answer = stringList(record.answer);
		if (answer.length === 0) return null;
		const reason = typeof record.reason === "string" ? record.reason.trim() : "";
		return { answer, reason };
	});
}

/** The comparison reply. Unknown verdicts are unusable (fail closed). */
export function parseCompareReply(text: string): CompareReply | null {
	return parseObjects(text, (value) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		if (record.verdict !== "same" && record.verdict !== "different") return null;
		const which = typeof record.which === "string" ? record.which.trim().toUpperCase() : "";
		const normalizedWhich =
			which === "A" || which === "B" || which === "BOTH" || which === "NEITHER"
				? (which === "BOTH" ? "both" : which === "NEITHER" ? "neither" : which) as CompareReply["which"]
				: record.verdict === "same"
					? "both"
					: "neither";
		const reason = typeof record.reason === "string" ? record.reason.trim() : "";
		return { verdict: record.verdict, which: normalizedWhich, reason };
	});
}

/** Resolve a solver answer to the option-value namespace. Labels are
 *  accepted too (models echo what they saw); matching is case-insensitive
 *  on the trim, and unknown strings stay as-is so a true answer that is not
 *  an option still reports honestly. */
function canonicalChoiceAnswers(
	answers: readonly string[],
	options: ReadonlyArray<{ label: string; value?: string }>,
): string[] {
	const exact = new Map<string, string>();
	const lowered = new Map<string, string>();
	for (const option of options) {
		const value = option.value?.trim() || option.label.trim();
		exact.set(value, value);
		exact.set(option.label.trim(), value);
		lowered.set(value.toLowerCase(), value);
		lowered.set(option.label.trim().toLowerCase(), value);
	}
	const out: string[] = [];
	for (const answer of answers) {
		const trimmed = answer.trim();
		if (!trimmed) continue;
		out.push(exact.get(trimmed) ?? lowered.get(trimmed.toLowerCase()) ?? trimmed);
	}
	return out;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	const left = [...new Set(a)].sort();
	const right = [...new Set(b)].sort();
	return left.length === right.length && left.every((v, i) => v === right[i]);
}

function quote(values: readonly string[]): string {
	return values.map((v) => `"${v}"`).join(", ");
}

/** The deterministic choice gate: the solver's answer SET must equal the
 *  committed set. This is the whole verdict for multiple choice — no model
 *  judgement participates. */
export function interpretSolverReply(
	reply: SolverReply,
	input: Extract<QuestionVerificationInput, { kind: "choice" }>,
): QuestionVerificationResult {
	const optionValues = input.options.map((o) => o.value?.trim() || o.label.trim());
	const expected = [...new Set(coerceCorrectAnswer(input.correctAnswer, optionValues))];
	const computed = canonicalChoiceAnswers(reply.answer, input.options);
	if (computed.length === 0) {
		return {
			ok: false,
			problems: [
				"The answer verifier did not state an answer to this question, so it cannot be posed. " +
					"Re-check the question and re-pose.",
			],
		};
	}
	if (sameSet(computed, expected)) return { ok: true };
	const outside = computed.filter((value) => !optionValues.includes(value));
	return {
		ok: false,
		problems: [
			`The answer verifier solved this question independently and got ${quote(computed)}, ` +
				`not the committed ${quote(expected)}.` +
				(outside.length > 0 ? ` (${quote(outside)} is not among the options.)` : "") +
				(reply.reason ? ` Verifier reasoning: ${reply.reason}` : "") +
				" Re-check the question, the options, and the explanation, then re-pose with a correct answer set.",
		],
	};
}

/** The comparison verdict for free recall and practice. Anything short of
 *  "the two answers are equivalent" rejects (fail closed). */
export function interpretCompareReply(
	reply: CompareReply,
	input: Exclude<QuestionVerificationInput, { kind: "choice" }>,
	candidate: string,
): QuestionVerificationResult {
	if (reply.verdict === "same") return { ok: true };
	const committed = committedAnswerOf(input);
	const who =
		reply.which === "A"
			? "it judged the committed answer correct and the independent solution wrong"
			: reply.which === "B"
				? "it judged the independent solution correct"
				: reply.which === "neither"
					? "it judged both answers wrong"
					: "it could not establish a single correct answer";
	return {
		ok: false,
		problems: [
			"The answer verifier solved this independently: " +
				`"${candidate.slice(0, 800)}${candidate.length > 800 ? "…" : ""}". ` +
				`The committed answer: "${committed.slice(0, 500)}${committed.length > 500 ? "…" : ""}". ` +
				`The comparison ${who}.` +
				(reply.reason ? ` Reason: ${reply.reason}` : "") +
				" Re-check the answer, then re-pose.",
		],
	};
}

export interface QuestionVerifierOptions {
	/** Per-model-call ceiling. A timeout REJECTS (fail closed). */
	timeoutMs?: number;
}

/** 45s per call (owner, 2026-10-27): live verifier calls at `high` thinking
 *  measured 9–26s; a 25s ceiling already cut a good call short. Free recall
 *  and practice make two calls, so their worst case is two ceilings. */
const DEFAULT_TIMEOUT_MS = 45_000;

type CallOutcome = { ok: true; text: string } | { ok: false; failure: string };

/** One fresh one-shot agent call, with its own timeout linked to the
 *  caller's abort signal. Parent aborts PROPAGATE (the turn was cancelled);
 *  only our own timeout becomes a verification failure. */
async function oneShot(
	engine: PiEngine,
	systemPrompt: string,
	prompt: string,
	options: { signal?: AbortSignal; onUsage?: (usage: Usage) => void },
	timeoutMs: number,
): Promise<CallOutcome> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onParentAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onParentAbort, { once: true });
	if (options.signal?.aborted) controller.abort();
	try {
		const run = await runSubagent([], {
			role: "teacher",
			engine,
			systemPrompt,
			prompt,
			maxTurns: 1,
			abortSignal: controller.signal,
			onUsage: options.onUsage,
		});
		if (options.signal?.aborted) throw Object.assign(new Error("Operation aborted"), { name: "AbortError" });
		return { ok: true, text: run.text };
	} catch (err) {
		if (options.signal?.aborted) throw err;
		const message = err instanceof Error ? err.message : String(err);
		const timedOut = controller.signal.aborted;
		return {
			ok: false,
			failure: timedOut ? `the verifier timed out after ${Math.round(timeoutMs / 1000)}s` : `the verifier could not run (${message})`,
		};
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onParentAbort);
	}
}

function unusable(failure: string): QuestionVerificationResult {
	return {
		ok: false,
		problems: [
			`${failure.charAt(0).toUpperCase()}${failure.slice(1)}, so this question cannot be posed. ` +
				"Re-check the question and answer, then re-pose; if verification keeps failing, the question is not ready.",
		],
	};
}

/** Build the verifier over the turn's resolved engine. The caller owns the
 *  engine lifetime; every call is a fresh one-shot agent. */
export function createQuestionVerifier(
	engine: PiEngine,
	options: QuestionVerifierOptions = {},
): QuestionVerifier {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return {
		async verify(input, opts = {}) {
			const solved = await oneShot(engine, SOLVER_SYSTEM_PROMPT, solverPrompt(input), opts, timeoutMs);
			if (!solved.ok) return unusable(solved.failure);
			const solverReply = parseSolverReply(solved.text);
			if (!solverReply) return unusable("the blind solver did not return a usable answer");

			if (input.kind === "choice") return interpretSolverReply(solverReply, input);

			// Free recall + practice: a second call compares the blind answer
			// with the committed one as equal-standing candidates.
			const compared = await oneShot(
				engine,
				COMPARE_SYSTEM_PROMPT,
				comparePrompt(input, solverReply.answer.join("\n")),
				opts,
				timeoutMs,
			);
			if (!compared.ok) return unusable(compared.failure);
			const compareReply = parseCompareReply(compared.text);
			if (!compareReply) return unusable("the answer comparison did not return a usable verdict");
			return interpretCompareReply(compareReply, input, solverReply.answer.join("\n"));
		},
	};
}
