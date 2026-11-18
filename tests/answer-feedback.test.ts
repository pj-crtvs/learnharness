/**
 * The post-answer Taglish feedback (owner, 2026-10-31): requests built from
 * the answer's own snapshot (never from what the teacher meant to say), one
 * silent model call, and the result attached to the answer's record message.
 *
 * Pinned here:
 * - QUESTIONS/ANSWERS stay English in the payload; only the instruction is
 *   Taglish and the prompt demands prose (no JSON, no second grade).
 * - The committed correct answer comes from the answer snapshot's indices.
 * - ask answers and dismissals never get feedback (ungraded).
 * - A failed/empty call leaves the card untouched.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

import {
	FEEDBACK_SYSTEM_PROMPT,
	feedbackPrompt,
	generateAnswerFeedback,
	practiceFeedbackRequest,
	questionFeedbackRequest,
} from "../src/agent/answer-feedback.ts";
import { runAnswerFeedback } from "../src/server/feedback.ts";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";
import type { PiEngine } from "../src/agent/models.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { QuestionAnswerData } from "../src/core/question-core.ts";

function engineFor(replies: Array<string | ((context: { messages: unknown[] }) => string)>): {
	engine: PiEngine;
	seen: string[];
} {
	const seen: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses(
		replies.map((reply) => (context) => {
			seen.push(context.messages.map((m) => JSON.stringify((m as { content: unknown }).content)).join("\n"));
			const text = typeof reply === "function" ? reply(context) : reply;
			return fauxAssistantMessage([fauxText(text)]);
		}),
	);
	return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, seen };
}

const QUIZ_ANSWER: QuestionAnswerData = {
	kind: "quiz",
	tool: "probe",
	questionType: "check",
	questionText: "Which planet is closest to the sun?",
	options: [
		{ index: 1, label: "Venus" },
		{ index: 2, label: "Mercury" },
		{ index: 3, label: "Mars" },
	],
	dontKnow: false,
	answers: [{ label: "Venus", value: "Venus", index: 1 }],
	thinking: "Venus feels hottest, so it must be closest.",
	confidence: 70,
	correct: false,
	correctIndices: [2],
	explanation: "Mercury is the innermost planet.",
	answeredAt: "2026-10-31T00:00:00.000Z",
};

describe("questionFeedbackRequest — built from the answer snapshot", () => {
	it("carries the question, the committed answer, the learner's words, and the verdict", () => {
		const request = questionFeedbackRequest(QUIZ_ANSWER, {
			correctAnswer: "Mercury",
			explanation: "should not override the snapshot",
		});
		assert.ok(request && request.kind === "question");
		assert.equal(request.tool, "probe");
		assert.equal(request.question, QUIZ_ANSWER.questionText);
		assert.deepEqual(request.options, ["Venus", "Mercury", "Mars"]);
		assert.equal(request.correctAnswer, "Mercury");
		assert.equal(request.learnerAnswer, "Venus");
		assert.equal(request.learnerThinking, "Venus feels hottest, so it must be closest.");
		assert.equal(request.verdict, "incorrect");
		assert.equal(request.explanation, "Mercury is the innermost planet.");
	});

	it("explain/recall use the commitment and carry no client verdict", () => {
		const request = questionFeedbackRequest({
			kind: "explain",
			tool: "recall",
			questionText: "State the chain rule.",
			dontKnow: false,
			answers: [],
			text: "Derivative of the outside times the derivative of the inside.",
			committed: "d/dt f(g(t)) = f'(g(t)) g'(t)",
			answeredAt: "2026-10-31T00:00:00.000Z",
		});
		assert.ok(request && request.kind === "question");
		assert.equal(request.correctAnswer, "d/dt f(g(t)) = f'(g(t)) g'(t)");
		assert.equal(request.learnerAnswer, "Derivative of the outside times the derivative of the inside.");
		assert.equal(request.verdict, undefined);
	});

	it("never builds feedback for ask (ungraded) or a dismissal", () => {
		assert.equal(
			questionFeedbackRequest({ ...QUIZ_ANSWER, kind: "ask", correct: undefined }),
			null,
		);
		assert.equal(questionFeedbackRequest({ ...QUIZ_ANSWER, dismissed: true }), null);
	});

	it("falls back to the call's raw correctAnswer for pre-snapshot records", () => {
		const request = questionFeedbackRequest(
			{ ...QUIZ_ANSWER, correctIndices: undefined },
			{ correctAnswer: ["Mercury"] },
		);
		assert.ok(request && request.kind === "question");
		assert.equal(request.correctAnswer, "Mercury");
	});
});

describe("practiceFeedbackRequest", () => {
	it("needs the statement, the committed solution, and a submission", () => {
		const request = practiceFeedbackRequest(
			{ statement: "Evaluate ∫_0^1 2x dx.", modelSolution: "1" },
			"I got 2 — I forgot to halve.",
		);
		assert.deepEqual(request, {
			kind: "practice",
			statement: "Evaluate ∫_0^1 2x dx.",
			modelSolution: "1",
			learnerAnswer: "I got 2 — I forgot to halve.",
		});
		assert.equal(practiceFeedbackRequest({ statement: "x" }, "y"), null);
		assert.equal(practiceFeedbackRequest({ statement: "x", modelSolution: "y" }, "   "), null);
	});
});

describe("feedbackPrompt — English payload, Taglish instruction", () => {
	it("asks for prose feedback and includes the learner's own reasoning", () => {
		const request = questionFeedbackRequest(QUIZ_ANSWER);
		assert.ok(request);
		const prompt = feedbackPrompt(request);
		assert.match(prompt, /Which planet is closest to the sun\?/);
		assert.match(prompt, /committed_answer/);
		assert.match(prompt, /Venus feels hottest/);
		assert.match(prompt, /Taglish feedback/);
		assert.match(FEEDBACK_SYSTEM_PROMPT, /Taglish/);
		assert.match(FEEDBACK_SYSTEM_PROMPT, /walang JSON/);
	});
});

describe("generateAnswerFeedback + runAnswerFeedback", () => {
	it("returns the model's prose and never retries a failure", async () => {
		const { engine, seen } = engineFor(["Tama ang formula, pero ang slip mo ay..."]);
		const request = questionFeedbackRequest(QUIZ_ANSWER);
		assert.ok(request);
		const result = await generateAnswerFeedback(engine, request);
		assert.equal(result?.text, "Tama ang formula, pero ang slip mo ay...");
		assert.equal(seen.length, 1);
		assert.match(seen[0]!, /Venus feels hottest/);
	});

	it("attaches the feedback to the answer's record message and logs the call", async () => {
		const chat = chatStore.createChat("feedback fixture");
		try {
			const answerMessage = {
				id: "msg_answer",
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "probe",
				content: [{ type: "text", text: "{}" }],
				details: QUIZ_ANSWER,
				timestamp: 1,
			} as unknown as LhMessage;
			chatStore.saveMessages(chat.id, [answerMessage]);

			const { engine } = engineFor(["Venus ang pinili mo, pero Mercury ang pinakamalapit."]);
			const request = questionFeedbackRequest(QUIZ_ANSWER);
			assert.ok(request);
			await runAnswerFeedback(chatStore, engine, "faux:test", {
				chatId: chat.id,
				messageId: "msg_answer",
				request,
			});

			const saved = chatStore.getChat(chat.id)!;
			const details = (saved.messages[0] as { details?: { feedback?: string } }).details;
			assert.equal(details?.feedback, "Venus ang pinili mo, pero Mercury ang pinakamalapit.");
			const usage = saved.turns?.find((t) => t.id === "feedback_msg_answer");
			assert.ok(usage, "the feedback call lands in the money log");
			assert.equal(usage.messageId, "msg_answer");
			assert.equal(usage.model, "faux:test");
		} finally {
			fs.unlinkSync(`${PATHS.chats}/${chat.id}.json`);
		}
	});

	it("a failed call leaves the answer untouched (no feedback, no usage)", async () => {
		const chat = chatStore.createChat("feedback failure fixture");
		try {
			const answerMessage = {
				id: "msg_answer",
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "probe",
				content: [{ type: "text", text: "{}" }],
				details: QUIZ_ANSWER,
				timestamp: 1,
			} as unknown as LhMessage;
			chatStore.saveMessages(chat.id, [answerMessage]);

			const { engine } = engineFor([""]);
			const request = questionFeedbackRequest(QUIZ_ANSWER);
			assert.ok(request);
			await runAnswerFeedback(chatStore, engine, "faux:test", {
				chatId: chat.id,
				messageId: "msg_answer",
				request,
			});

			const saved = chatStore.getChat(chat.id)!;
			assert.equal((saved.messages[0] as { details?: { feedback?: string } }).details?.feedback, undefined);
			assert.equal(saved.turns?.length ?? 0, 0);
		} finally {
			fs.unlinkSync(`${PATHS.chats}/${chat.id}.json`);
		}
	});
});
