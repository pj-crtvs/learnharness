import { NextResponse } from "next/server";
import { explainStore, settingsStore, piEngineForSpec, runSubagent } from "@/src/server";
import { resolveRoleSpec } from "@/src/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const question = typeof body?.question === "string" ? body.question : "";
	const userExplanation = typeof body?.userExplanation === "string" ? body.userExplanation : "";
	const confidence = Number(body?.confidence) || 3;
	const reference = typeof body?.reference === "string" ? body.reference : "";
	const cardId = typeof body?.cardId === "string" ? body.cardId : undefined;
	if (!question || !userExplanation) return NextResponse.json({ error: "question and userExplanation required" }, { status: 400 });

	const settings = settingsStore.readSettings();
	const spec = resolveRoleSpec("researcher", settings);
	if (!spec) return NextResponse.json({ error: "models not configured" }, { status: 503 });
	const engine = piEngineForSpec(spec, true);

	const prompt = `You are evaluating a student's explanation. Return ONLY valid JSON with these fields:
overall (0-100), conceptual (0-100), completeness (0-100), reasoning (0-100), technical (0-100), application (0-100),
correctStatements (string[]), incorrectStatements (string[]), missing (string[]), misconceptions (string[]),
strengths (string[]), improvements (string[]), suggested (string), followUp (string).

Question: ${question}
Reference answer/context: ${reference}
Student confidence (1-5): ${confidence}
Student explanation: ${userExplanation}

Be specific and educational. Do not penalize grammar.`;

	let raw = "";
	try {
		const result = await runSubagent([], { role: "researcher", engine, systemPrompt: "Return only JSON.", messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] as any, maxTurns: 1 });
		raw = result.text ?? "";
	} catch (err) {
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
	let parsed: any;
	try {
		const m = raw.match(/\{[\s\S]*\}/);
		parsed = JSON.parse(m ? m[0] : raw);
	} catch {
		return NextResponse.json({ error: "invalid JSON", raw }, { status: 500 });
	}
	const evaluation = {
		overall: Number(parsed.overall) || 0,
		conceptual: Number(parsed.conceptual) || 0,
		completeness: Number(parsed.completeness) || 0,
		reasoning: Number(parsed.reasoning) || 0,
		technical: Number(parsed.technical) || 0,
		application: Number(parsed.application) || 0,
		correctStatements: parsed.correctStatements ?? [],
		incorrectStatements: parsed.incorrectStatements ?? [],
		missing: parsed.missing ?? [],
		misconceptions: parsed.misconceptions ?? [],
		strengths: parsed.strengths ?? [],
		improvements: parsed.improvements ?? [],
		suggested: parsed.suggested ?? "",
		followUp: parsed.followUp ?? "",
	};
	const attempt = explainStore.addAttempt({ cardId, question, userExplanation, confidence, evaluation });
	return NextResponse.json({ attempt, evaluation });
}
