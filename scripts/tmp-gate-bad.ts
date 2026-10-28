/**
 * TEMPORARY (deleted after use): the deterministic gate on the exact parsed
 * reply, then N independent verifier runs on the bad question.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { piEngineForSpec, registerCustomPiProvider } from "../src/agent/models.ts";
import {
	SOLVER_SYSTEM_PROMPT,
	createQuestionVerifier,
	interpretSolverReply,
	parseSolverReply,
	solverPrompt,
	verificationInputFromContent,
} from "../src/agent/question-verify.ts";
import { gradedQuestionContent } from "../src/core/question-content.ts";
import { runSubagent } from "../src/agent/subagents/pi-run.ts";
import { readCustomProviders } from "../src/store/custom-providers.ts";

const dataDir = path.join(process.env.HOME!, "Library/Application Support/LearnHarness/data");
const settings = JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8"));
const strong = settings.models.strong;
for (const provider of readCustomProviders()) registerCustomPiProvider(provider);
const engine = piEngineForSpec({ provider: strong.model.provider, id: strong.model.id, thinkingLevel: strong.thinkingLevel });

const chat = JSON.parse(fs.readFileSync(path.join(dataDir, "chats/chat_mvnsbkp0_bbe04d8b.json"), "utf8"));
const message = chat.messages.find((m: { id: string }) => m.id === "msg_mvq8dc64_2412996b");
const content = gradedQuestionContent(message)[0]!;
const input = verificationInputFromContent(content);
if (input.kind !== "choice") throw new Error("not choice");

console.log(
	"deterministic gate on a 230 reply:",
	JSON.stringify(interpretSolverReply({ answer: ["230"], reason: "230" }, input)),
);

const runs = Number(process.argv[2] ?? 3);
for (let i = 0; i < runs; i++) {
	const t0 = Date.now();
	const run = await runSubagent([], {
		role: "teacher",
		engine,
		systemPrompt: SOLVER_SYSTEM_PROMPT,
		prompt: solverPrompt(input),
		maxTurns: 1,
	});
	const parsed = parseSolverReply(run.text);
	console.log(`\n[${i + 1}] ${Date.now() - t0}ms raw=${run.text.replace(/\s+/g, " ").slice(0, 300)}`);
	console.log(`[${i + 1}] parsed=`, JSON.stringify(parsed));
	if (parsed) console.log(`[${i + 1}] gate=`, JSON.stringify(interpretSolverReply(parsed, input)));
}
