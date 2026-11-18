import { normalizeContext } from "@earendil-works/pi-ai";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import { stores } from "./stores.ts";
import type { AnimationSpec } from "../core/contracts.ts";

const SYSTEM = `You are an expert educational animator using Manim Community Edition.
Given a learning request, produce a SINGLE valid Manim CE Python scene that
explains the concept visually and accurately. Output STRICT JSON only (no
markdown fences) with this shape:
{
  "title": string,
  "subject": string,
  "topic": string,
  "learningObjective": string,
  "sceneName": string,
  "code": string,
  "explanation": string,
  "scenes": [{"title": string, "description": string, "narration"?: string, "equation"?: string}],
  "keyTakeaways": string[],
  "misconceptions": string[],
  "knowledgeChecks": string[]
}
Rules for code:
- Must start with "from manim import *" and define exactly one Scene subclass.
- Use only manim imports; no os/subprocess/sys/open/eval/exec.
- Keep scene under ~30 seconds; use self.play/self.wait.
- Use MathTex for equations; ensure valid LaTeX.
- Be pedagogically clear: introduce, visualize, explain, summarize.
- Do not invent facts or unsupported relationships.
Return JSON only.`;

export interface GenerationInput {
	topic: string;
	subject?: string;
	learningObjective?: string;
	difficulty?: string;
	duration?: number;
	style?: string;
	equation?: string;
}

export interface GenerationResult {
	title: string;
	subject: string;
	topic: string;
	learningObjective: string;
	sceneName: string;
	code: string;
	spec: AnimationSpec;
	explanation: string;
}

export async function generateManimAnimation(input: GenerationInput): Promise<GenerationResult> {
	const spec = resolveRoleSpec("visualMaker", stores.settingsStore.readSettings());
	if (!spec) throw new Error("models_not_configured");
	const engine: PiEngine = piEngineForSpec(spec);
	const userPrompt = [
		`Topic: ${input.topic}`,
		`Subject: ${input.subject || "mathematics"}`,
		`Learning objective: ${input.learningObjective || "understand " + input.topic}`,
		`Difficulty: ${input.difficulty || "intermediate"}`,
		`Preferred duration seconds: ${input.duration || 30}`,
		`Explanation style: ${input.style || "step-by-step"}`,
		input.equation ? `Specific equation/problem: ${input.equation}` : "",
	].filter(Boolean).join("\n");

	const stream = engine.streamFn(engine.model, normalizeContext({ systemPrompt: SYSTEM, messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }], tools: [] }), {
		sessionId: crypto.randomUUID(),
		reasoning: engine.level && engine.level !== "off" ? engine.level : undefined,
	} as never);

	let text = "";
	for await (const event of stream) {
		if (event.type === "done") {
			const msg = event.message as { content?: Array<{ type: string; text?: string }> };
			text = (msg.content ?? [])
				.filter((c) => c.type === "text")
				.map((c) => c.text || "")
				.join("");
			break;
		}
		if (event.type === "error") {
			throw new Error(event.error?.errorMessage ?? "generation failed");
		}
	}
	if (!text) throw new Error("empty model response");

	// extract JSON
	let jsonText = text.trim();
	const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence && fence[1]) jsonText = fence[1].trim();
	const parsed = JSON.parse(jsonText) as Record<string, unknown>;

	const code = String(parsed.code || "");
	if (!code.includes("from manim")) throw new Error("model did not return manim code");

	const scenes = Array.isArray(parsed.scenes)
		? parsed.scenes.map((s: Record<string, unknown>) => ({
				title: String(s?.title || ""),
				description: String(s?.description || ""),
				narration: s?.narration ? String(s.narration) : undefined,
				equation: s?.equation ? String(s.equation) : undefined,
			}))
		: [];
	const animationSpec: AnimationSpec = {
		title: String(parsed.title || input.topic),
		subject: String(parsed.subject || input.subject || "mathematics"),
		topic: String(parsed.topic || input.topic),
		learningObjective: String(parsed.learningObjective || input.learningObjective || ""),
		scenes,
		keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways.map(String) : [],
		misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions.map(String) : [],
		knowledgeChecks: Array.isArray(parsed.knowledgeChecks) ? parsed.knowledgeChecks.map(String) : [],
	};

	return {
		title: animationSpec.title,
		subject: animationSpec.subject,
		topic: animationSpec.topic,
		learningObjective: animationSpec.learningObjective,
		sceneName: String(parsed.sceneName || "GeneratedScene"),
		code,
		spec: animationSpec,
		explanation: String(parsed.explanation || ""),
	};
}
