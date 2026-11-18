import { NextResponse } from "next/server";
import { dostStore } from "@/src/server";
import { settingsStore } from "@/src/server";
import { resolveRoleSpec } from "@/src/core";
import { piEngineForSpec } from "@/src/server";
import { runSubagent } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const questionId = typeof body?.questionId === "string" ? body.questionId : "";
	const hintLevel = Number(body?.level) || 1;
	const q = dostStore.getQuestion(questionId);
	if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });

	const settings = settingsStore.readSettings();
	const spec = resolveRoleSpec("researcher", settings);
	if (!spec) return NextResponse.json({ error: "models not configured" }, { status: 503 });
	const engine = piEngineForSpec(spec, true);

	const prompt = `You are a tutor. Give hint level ${hintLevel} (1=conceptual direction, 2=relevant principle, 3=suggested approach, 4=next step) for this question. Do not reveal the full answer. Use Taglish. Question: ${q.stem}. Correct answer (do not reveal): ${q.correct}.`;

	let raw = "";
	try {
		const result = await runSubagent([], {
			role: "researcher",
			engine,
			systemPrompt: "You give hints, not answers. Taglish.",
			messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] as any,
			maxTurns: 1,
		});
		raw = result.text ?? "";
	} catch (err) {
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
	return NextResponse.json({ hint: raw.trim() });
}
