import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

import {
	comparePrompt,
	createQuestionVerifier,
	interpretCompareReply,
	interpretSolverReply,
	jsonObjects,
	parseCompareReply,
	parseSolverReply,
	solverPrompt,
	type QuestionVerificationInput,
	type QuestionVerifier,
} from "../src/agent/question-verify.ts";
import { probeQuizToolFor } from "../src/agent/tools.ts";
import { problemTool, type PracticeGate } from "../src/agent/tools/practice.ts";
import type { PiEngine } from "../src/agent/models.ts";

/**
 * The correctness gate (owner, 2026-10-27): a structurally valid question is
 * not enough, and a verifier that sees the committed answer rationalizes
 * toward it (the live CSS run did exactly that). The solver is BLIND; the
 * choice verdict is deterministic; free recall and practice get a second
 * equal-standing comparison.
 */

const CHOICE: Extract<QuestionVerificationInput, { kind: "choice" }> = {
	kind: "choice",
	question: "Under the default box model, what is the rendered width of `.box { width: 200px; padding: 10px; border: 5px solid black; }`?",
	options: [
		{ label: "200 px", value: "200" },
		{ label: "210 px", value: "210" },
		{ label: "250 px", value: "250" },
		{ label: "260 px", value: "260" },
	],
	correctAnswer: "250",
	explanation: "200 + 20 + 20 + 5 + 5 = 250",
};

const GOOD: Extract<QuestionVerificationInput, { kind: "choice" }> = {
	kind: "choice",
	question: CHOICE.question,
	options: [
		{ label: "200 px", value: "200" },
		{ label: "230 px", value: "230" },
		{ label: "250 px", value: "250" },
	],
	correctAnswer: "230",
	explanation: "200 content + 20 padding + 10 border = 230",
};

const FREE: Extract<QuestionVerificationInput, { kind: "free" }> = {
	kind: "free",
	question: "State the chain rule.",
	correctAnswer: "d/dt f(g(t)) = f'(g(t)) g'(t)",
};

const PROBLEM: Extract<QuestionVerificationInput, { kind: "problem" }> = {
	kind: "problem",
	statement: "Compute the rendered width of a 200px content box with 10px padding and 5px borders.",
	modelSolution: "230 px",
};

/** A scripted engine over a reply queue; records every model request. */
function engineFor(replies: string[], seen?: string[]): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses(replies.map((text) => () => fauxAssistantMessage([fauxText(text)])));
	return {
		model: faux.getModel(),
		streamFn: (model, context, options) => {
			seen?.push(JSON.stringify(context));
			return faux.streamSimple(model, context, options);
		},
	};
}

function fakeVerifier(result: Awaited<ReturnType<QuestionVerifier["verify"]>>): QuestionVerifier {
	return { verify: async () => result };
}

describe("jsonObjects — balanced, string-aware, in order", () => {
	it("finds narrated and self-corrected objects (braces in strings survive)", () => {
		const objects = jsonObjects('first {"a":"}{"} then {"b":1}');
		assert.deepEqual(objects, ['{"a":"}{"}', '{"b":1}']);
	});
});

describe("parseSolverReply — the blind solver's contract", () => {
	it("takes the LAST valid object when the model self-corrects", () => {
		const reply = parseSolverReply(
			'{"answer":["250"],"reason":"wrong first pass"}\n\nWait. Recompute.\n\n{"answer":["230"],"reason":"padding 20 + border 10"}',
		);
		assert.deepEqual(reply, { answer: ["230"], reason: "padding 20 + border 10" });
	});

	it("accepts numbers and fenced JSON; rejects empty answers and prose", () => {
		assert.deepEqual(parseSolverReply("```json\n{\"answer\":[230],\"reason\":\"ok\"}\n```"), { answer: ["230"], reason: "ok" });
		assert.equal(parseSolverReply('{"answer":[],"reason":"unsure"}'), null);
		assert.equal(parseSolverReply("The answer is 230."), null);
	});
});

describe("parseCompareReply — the comparison contract", () => {
	it("requires a known verdict and normalizes which", () => {
		assert.deepEqual(parseCompareReply('{"verdict":"same","reason":"equivalent"}'), {
			verdict: "same",
			which: "both",
			reason: "equivalent",
		});
		assert.equal(parseCompareReply('{"verdict":"same","which":"b","reason":""}')?.which, "B");
		assert.equal(parseCompareReply('{"verdict":"maybe","reason":""}'), null);
	});
});

describe("solverPrompt — BLIND: the committed answer never reaches the solver", () => {
	it("omits the commitment and the explanation for every kind", () => {
		const choice = solverPrompt(CHOICE);
		assert.match(choice, /default box model/);
		assert.match(choice, /"value": "250"/, "option values are present — that is the option set, not the commitment");
		assert.doesNotMatch(choice, /claimed/i);
		assert.doesNotMatch(choice, /correctAnswer/);
		const free = solverPrompt(FREE);
		assert.doesNotMatch(free, /f'\(g\(t\)\)/, "the committed answer is absent");
		const problem = solverPrompt(PROBLEM);
		assert.doesNotMatch(problem, /230/, "the committed solution is absent");
	});

	it("the comparison prompt presents both candidates as A/B, no authority framing", () => {
		const prompt = comparePrompt(FREE, "the derivative of the outer times the inner derivative");
		assert.match(prompt, /candidate_A/);
		assert.match(prompt, /candidate_B/);
		assert.doesNotMatch(prompt, /teacher|committed|correct answer/i);
	});
});

describe("interpretSolverReply — the deterministic multiple-choice verdict", () => {
	it("rejects the CSS incident (solver says 230, commitment says 250)", () => {
		const verdict = interpretSolverReply({ answer: ["230"], reason: "200 + 20 + 10 = 230" }, CHOICE);
		assert.equal(verdict.ok, false);
		if (!verdict.ok) {
			assert.match(verdict.problems[0]!, /230/);
			assert.match(verdict.problems[0]!, /250/);
			assert.match(verdict.problems[0]!, /not among the options/);
		}
	});

	it("passes a correct commitment and maps echoed labels to values", () => {
		assert.equal(interpretSolverReply({ answer: ["230"], reason: "" }, GOOD).ok, true);
		assert.equal(interpretSolverReply({ answer: ["230 px"], reason: "" }, GOOD).ok, true);
		assert.equal(interpretSolverReply({ answer: ["230 PX"], reason: "" }, GOOD).ok, true);
	});

	it("multi-select needs the whole set, not a subset", () => {
		const multi: Extract<QuestionVerificationInput, { kind: "choice" }> = {
			kind: "choice",
			question: "Which are prime?",
			options: [
				{ label: "2", value: "2" },
				{ label: "3", value: "3" },
				{ label: "4", value: "4" },
			],
			correctAnswer: ["2", "3"],
			multiSelect: true,
		};
		assert.equal(interpretSolverReply({ answer: ["2", "3"], reason: "" }, multi).ok, true);
		assert.equal(interpretSolverReply({ answer: ["2"], reason: "" }, multi).ok, false);
	});
});

describe("interpretCompareReply — free recall and practice", () => {
	it("passes only when the independent answer is equivalent", () => {
		assert.equal(
			interpretCompareReply({ verdict: "same", which: "both", reason: "same rule" }, FREE, "f'(g(t))·g'(t)").ok,
			true,
		);
	});

	it("rejects a disagreement and names the sides", () => {
		const verdict = interpretCompareReply(
			{ verdict: "different", which: "B", reason: "the committed answer states the product rule" },
			FREE,
			"f'(g(t)) g'(t)",
		);
		assert.equal(verdict.ok, false);
		if (!verdict.ok) {
			assert.match(verdict.problems[0]!, /independent solution correct/);
			assert.match(verdict.problems[0]!, /product rule/);
		}
	});
});

describe("createQuestionVerifier — blind solve, then (if needed) compare", () => {
	it("choice: solves without ever seeing the committed answer", async () => {
		const seen: string[] = [];
		const verifier = createQuestionVerifier(
			engineFor(['{"answer":["230"],"reason":"200 + 20 + 10"}'], seen),
		);
		const verdict = await verifier.verify(CHOICE);
		assert.equal(verdict.ok, false);
		assert.equal(seen.length, 1, "multiple choice is ONE call");
		assert.doesNotMatch(seen[0]!, /"250"/, "the committed answer is not in the request");
		assert.doesNotMatch(seen[0]!, /200 \+ 20 \+ 20/, "the committed explanation is not in the request");
	});

	it("choice: a matching blind answer passes", async () => {
		const verifier = createQuestionVerifier(engineFor(['{"answer":["230"],"reason":"230"}']));
		assert.equal((await verifier.verify(GOOD)).ok, true);
	});

	it("free recall: blind answer + comparison, pass and fail", async () => {
		const ok = createQuestionVerifier(
			engineFor([
				'{"answer":["f\'(g(t)) times g\'(t)"],"reason":"chain rule"}',
				'{"verdict":"same","which":"both","reason":"same rule"}',
			]),
		);
		assert.equal((await ok.verify(FREE)).ok, true);

		const bad = createQuestionVerifier(
			engineFor([
				'{"answer":["the product rule"],"reason":"confused rules"}',
				'{"verdict":"different","which":"B","reason":"the committed answer is the product rule"}',
			]),
		);
		const verdict = await bad.verify(FREE);
		assert.equal(verdict.ok, false);
		if (!verdict.ok) assert.match(verdict.problems[0]!, /product rule/);
	});

	it("practice: the blind solution is compared with the model solution", async () => {
		const ok = createQuestionVerifier(
			engineFor(['{"answer":["230 px"],"reason":"200 + 20 + 10"}', '{"verdict":"same","which":"both","reason":""}']),
		);
		assert.equal((await ok.verify(PROBLEM)).ok, true);

		const bad = createQuestionVerifier(
			engineFor(['{"answer":["250 px"],"reason":"200 + 20 + 20 + 5 + 5"}', '{"verdict":"different","which":"B","reason":"double-counted padding"}']),
		);
		assert.equal((await bad.verify(PROBLEM)).ok, false);
	});

	it("fails closed on unusable model output (never a pass)", async () => {
		const verifier = createQuestionVerifier(engineFor(["I cannot help with that."]));
		const verdict = await verifier.verify(CHOICE);
		assert.equal(verdict.ok, false);
		if (!verdict.ok) assert.match(verdict.problems[0]!, /cannot be posed/);
	});
});

describe("question tools — the gate runs before the pose", () => {
	const probeArgs = {
		question: CHOICE.question,
		options: CHOICE.options,
		explanation: CHOICE.explanation ?? "",
		correctAnswer: "250",
	};

	it("poses a verified probe and rejects a disputed one", async () => {
		const okTool = probeQuizToolFor({ verifyQuestion: fakeVerifier({ ok: true }) });
		const posed = await okTool.execute!("call-1", probeArgs);
		assert.equal((posed as { isError?: boolean }).isError, undefined);
		assert.equal((posed as { terminate?: boolean }).terminate, true);

		const badTool = probeQuizToolFor({
			verifyQuestion: fakeVerifier({ ok: false, problems: ["the verifier computed 230"] }),
		});
		const rejected = await badTool.execute!("call-2", probeArgs);
		assert.equal((rejected as { isError?: boolean }).isError, true);
		assert.match(JSON.stringify(rejected), /230/);
	});

	it("practice problem: a disputed model solution never becomes active", async () => {
		const gate: PracticeGate = { problemActive: false };
		const tool = problemTool(gate, undefined, fakeVerifier({ ok: false, problems: ["solution is wrong"] }));
		const result = await tool.execute!("call-3", {
			statement: "Compute the box width.",
			mode: "recall",
			modelSolution: "250 px",
		});
		assert.equal((result as { isError?: boolean }).isError, true);
		assert.equal(gate.problemActive, false, "a rejected problem must not consume the slot");
	});

	it("practice problem: a verified solution poses and claims the slot", async () => {
		const gate: PracticeGate = { problemActive: false };
		const tool = problemTool(gate, undefined, fakeVerifier({ ok: true }));
		const result = await tool.execute!("call-4", {
			statement: "Compute the box width.",
			mode: "recall",
			modelSolution: "230 px",
		});
		assert.equal((result as { terminate?: boolean }).terminate, true);
		assert.equal(gate.problemActive, true);
	});
});
