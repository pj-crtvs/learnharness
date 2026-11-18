import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

export interface ExplainEval {
	overall: number;
	conceptual: number;
	completeness: number;
	reasoning: number;
	technical: number;
	application: number;
	correctStatements: string[];
	incorrectStatements: string[];
	missing: string[];
	misconceptions: string[];
	strengths: string[];
	improvements: string[];
	suggested: string;
	followUp: string;
}

export interface ExplainAttempt {
	id: string;
	cardId?: string;
	question: string;
	userExplanation: string;
	confidence: number;
	evaluation: ExplainEval;
	revisedExplanation?: string;
	revisedEvaluation?: ExplainEval;
	createdAt: string;
}

interface Misconception { id: string; description: string; count: number; createdAt: string }
interface StoreData { attempts: ExplainAttempt[]; misconceptions: Misconception[] }

type PatchType = Partial<Pick<ExplainAttempt, "revisedExplanation" | "revisedEvaluation">>;

const FILE = path.join(PATHS.data, "explain.json");
function load(): StoreData { try { const raw = fs.readFileSync(FILE, "utf8"); const p = JSON.parse(raw) as Partial<StoreData>; return { attempts: p.attempts ?? [], misconceptions: p.misconceptions ?? [] }; } catch { return { attempts: [], misconceptions: [] }; } }
function save(d: StoreData): void { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2), "utf8"); }
function now(): string { return new Date().toISOString(); }
function makeId(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export const explainStore = {
	listAttempts(cardId?: string): ExplainAttempt[] {
		const d = load();
		const a = cardId ? d.attempts.filter(function (x) { return x.cardId === cardId; }) : d.attempts;
		return a.sort(function (x, y) { return y.createdAt.localeCompare(x.createdAt); });
	},
	addAttempt(a: Omit<ExplainAttempt, "id" | "createdAt">): ExplainAttempt {
		const d = load();
		const entry: ExplainAttempt = { id: makeId("exp"), cardId: a.cardId, question: a.question, userExplanation: a.userExplanation, confidence: a.confidence, evaluation: a.evaluation, revisedExplanation: a.revisedExplanation, revisedEvaluation: a.revisedEvaluation, createdAt: now() };
		d.attempts.push(entry);
		for (const m of a.evaluation.misconceptions) {
			const existing = d.misconceptions.find(function (x) { return x.description.toLowerCase() === m.toLowerCase(); });
			if (existing) {
				existing.count = existing.count + 1;
			} else {
				d.misconceptions.push({ id: makeId("mc"), description: m, count: 1, createdAt: now() });
			}
		}
		save(d);
		return entry;
	},
	updateAttempt(id: string, patch: PatchType): ExplainAttempt | null {
		const d = load();
		const a = d.attempts.find(function (x) { return x.id === id; });
		if (!a) return null;
		Object.assign(a, patch);
		save(d);
		return a;
	},
	listMisconceptions(): Misconception[] { return load().misconceptions; },
};
