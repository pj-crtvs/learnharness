/**
 * TEMPORARY live check (deleted after use): raw verifier replies + timing.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { piEngineForSpec, registerCustomPiProvider } from "../src/agent/models.ts";
import { VERIFIER_SYSTEM_PROMPT, verifierPrompt, type QuestionVerificationInput } from "../src/agent/question-verify.ts";
import { runSubagent } from "../src/agent/subagents/pi-run.ts";
import { readCustomProviders } from "../src/store/custom-providers.ts";

const dataDir = path.join(process.env.HOME!, "Library/Application Support/LearnHarness/data");
const settings = JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8"));
const strong = settings.models?.strong ?? { model: { provider: "custom-pandev", id: "auto" }, thinkingLevel: "high" };

for (const provider of readCustomProviders()) registerCustomPiProvider(provider);

const level = (process.argv[2] ?? strong.thinkingLevel ?? "high") as never;
const engine = piEngineForSpec({ provider: strong.model.provider, id: strong.model.id, thinkingLevel: level });

const GOOD: QuestionVerificationInput = {
	kind: "choice",
	question:
		"Under the default box model, what is the rendered width of `.box { width: 200px; padding: 10px; border: 5px solid black; }`?",
	options: [
		{ label: "200 px", value: "200" },
		{ label: "230 px", value: "230" },
		{ label: "250 px", value: "250" },
	],
	correctAnswer: "230",
	explanation: "200 content + 20 padding + 10 border = 230",
};

const BAD: QuestionVerificationInput = {
	kind: "choice",
	question:
		"Under the default box model, what is the rendered width of `.box { width: 200px; padding: 10px; border: 5px solid black; }`?",
	options: [
		{ label: "200 px", value: "200" },
		{ label: "210 px", value: "210" },
		{ label: "250 px", value: "250" },
		{ label: "260 px", value: "260" },
	],
	correctAnswer: "250",
	explanation: "200 + 20 + 20 + 5 + 5 = 250",
};

const rounds = Number(process.argv[3] ?? 2);
for (const [name, input] of [["GOOD-230", GOOD], ["BAD-250", BAD]] as const) {
	for (let i = 0; i < rounds; i++) {
		const t0 = Date.now();
		const run = await runSubagent([], {
			role: "teacher",
			engine,
			systemPrompt: VERIFIER_SYSTEM_PROMPT,
			prompt: verifierPrompt(input),
			maxTurns: 1,
		});
		console.log(`\n=== ${name} #${i + 1} — ${Date.now() - t0}ms (level ${String(level)})`);
		console.log(run.text.trim().slice(0, 700));
	}
}
