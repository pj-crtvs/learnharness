import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

export type MasteryState = "unfamiliar" | "learning" | "developing" | "proficient" | "mastered";

export interface Skill {
	id: string;
	name: string;
	domain: string;
	parentId?: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
}

export interface SkillRelation {
	id: string;
	from: string;
	to: string;
	type: "prerequisite" | "depends_on" | "related" | "extension" | "application" | "part_of" | "alternative";
	createdAt: string;
}

export interface LearningEvidence {
	id: string;
	skillId: string;
	sourceType: "teaching" | "practice" | "flashcard" | "diagnostic" | "pdf";
	activityId?: string;
	correct: boolean;
	score?: number;
	independent: boolean;
	hintUsed?: boolean;
	timestamp: string;
}

export interface MasteryRecord {
	skillId: string;
	conceptual: number;
	procedural: number;
	independent: number;
	retention: number;
	application: number;
	reasoning: number;
	score: number;
	confidence: "low" | "moderate" | "strong";
	state: MasteryState;
	evidenceCount: number;
	lastDemonstrated?: string;
	updatedAt: string;
}

export interface Misconception {
	id: string;
	skillId: string;
	description: string;
	resolved: boolean;
	createdAt: string;
	updatedAt: string;
}

interface StoreData {
	skills: Skill[];
	relations: SkillRelation[];
	evidence: LearningEvidence[];
	mastery: MasteryRecord[];
	misconceptions: Misconception[];
}

const FILE = path.join(PATHS.data, "learning.json");

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		return {
			skills: parsed.skills ?? [],
			relations: parsed.relations ?? [],
			evidence: parsed.evidence ?? [],
			mastery: parsed.mastery ?? [],
			misconceptions: parsed.misconceptions ?? [],
		};
	} catch {
		return { skills: [], relations: [], evidence: [], mastery: [], misconceptions: [] };
	}
}

function save(data: StoreData): void {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function now(): string {
	return new Date().toISOString();
}

function makeId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function recomputeMastery(data: StoreData, skillId: string): MasteryRecord {
	const evs = data.evidence.filter((e) => e.skillId === skillId);
	const total = evs.length;
	const correct = evs.filter((e) => e.correct).length;
	const independent = evs.filter((e) => e.independent).length;
	const avgScore = total ? evs.reduce((a, e) => a + (e.score ?? (e.correct ? 1 : 0)), 0) / total : 0;
	let state: MasteryState = "unfamiliar";
	if (total === 0) state = "unfamiliar";
	else if (avgScore < 0.4) state = "learning";
	else if (avgScore < 0.65) state = "developing";
	else if (avgScore < 0.85 || total < 5) state = "proficient";
	else state = "mastered";
	const confidence: MasteryRecord["confidence"] = total < 3 ? "low" : total < 8 ? "moderate" : "strong";
	const last = evs.length ? evs[evs.length - 1]!.timestamp : undefined;
	const record: MasteryRecord = {
		skillId,
		conceptual: avgScore,
		procedural: avgScore,
		independent: total ? independent / total : 0,
		retention: avgScore,
		application: avgScore,
		reasoning: avgScore,
		score: avgScore,
		confidence,
		state,
		evidenceCount: total,
		lastDemonstrated: last,
		updatedAt: now(),
	};
	const idx = data.mastery.findIndex((m) => m.skillId === skillId);
	if (idx >= 0) data.mastery[idx] = record; else data.mastery.push(record);
	return record;
}

export const learningStore = {
	listSkills(): Skill[] { return load().skills; },
	createSkill(skill: Omit<Skill, "id" | "createdAt" | "updatedAt">): Skill {
		const data = load();
		const s: Skill = { id: makeId("skill"), ...skill, createdAt: now(), updatedAt: now() };
		data.skills.push(s);
		save(data);
		return s;
	},
	listRelations(): SkillRelation[] { return load().relations; },
	addRelation(rel: Omit<SkillRelation, "id" | "createdAt">): SkillRelation {
		const data = load();
		const r: SkillRelation = { id: makeId("rel"), ...rel, createdAt: now() };
		data.relations.push(r);
		save(data);
		return r;
	},
	addEvidence(ev: Omit<LearningEvidence, "id" | "timestamp">): LearningEvidence {
		const data = load();
		const e: LearningEvidence = { id: makeId("ev"), ...ev, timestamp: now() };
		data.evidence.push(e);
		recomputeMastery(data, ev.skillId);
		save(data);
		return e;
	},
	listEvidence(skillId?: string): LearningEvidence[] {
		const data = load();
		return skillId ? data.evidence.filter((e) => e.skillId === skillId) : data.evidence;
	},
	getMastery(skillId: string): MasteryRecord | null {
		return load().mastery.find((m) => m.skillId === skillId) ?? null;
	},
	listMastery(): MasteryRecord[] { return load().mastery; },
	listMisconceptions(): Misconception[] { return load().misconceptions; },
	addMisconception(m: Omit<Misconception, "id" | "createdAt" | "updatedAt" | "resolved">): Misconception {
		const data = load();
		const mc: Misconception = { id: makeId("mc"), resolved: false, ...m, createdAt: now(), updatedAt: now() };
		data.misconceptions.push(mc);
		save(data);
		return mc;
	},
	resolveMisconception(id: string): void {
		const data = load();
		const mc = data.misconceptions.find((m) => m.id === id);
		if (mc) { mc.resolved = true; mc.updatedAt = now(); save(data); }
	},
	seedDefaultSkills(): void {
		const data = load();
		if (data.skills.length > 0) return;
		const domains = [
			{ name: "Variables and Data Types", domain: "Programming Fundamentals" },
			{ name: "Control Structures", domain: "Programming Fundamentals" },
			{ name: "Functions", domain: "Programming Fundamentals" },
			{ name: "Recursion", domain: "Programming Fundamentals" },
			{ name: "Arrays", domain: "Programming Fundamentals" },
			{ name: "Pointers", domain: "Programming Fundamentals" },
			{ name: "Object-Oriented Programming", domain: "Programming Fundamentals" },
			{ name: "Algorithm Analysis", domain: "Data Structures and Algorithms" },
			{ name: "Big-O Notation", domain: "Data Structures and Algorithms" },
			{ name: "Searching", domain: "Data Structures and Algorithms" },
			{ name: "Sorting", domain: "Data Structures and Algorithms" },
			{ name: "Linked Lists", domain: "Data Structures and Algorithms" },
			{ name: "Stacks", domain: "Data Structures and Algorithms" },
			{ name: "Queues", domain: "Data Structures and Algorithms" },
			{ name: "Hash Tables", domain: "Data Structures and Algorithms" },
			{ name: "Trees", domain: "Data Structures and Algorithms" },
			{ name: "Graphs", domain: "Data Structures and Algorithms" },
			{ name: "Dynamic Programming", domain: "Data Structures and Algorithms" },
			{ name: "Logic", domain: "Discrete Mathematics" },
			{ name: "Sets", domain: "Discrete Mathematics" },
			{ name: "Combinatorics", domain: "Discrete Mathematics" },
			{ name: "Mathematical Induction", domain: "Discrete Mathematics" },
			{ name: "Boolean Algebra", domain: "Computer Architecture" },
			{ name: "Logic Gates", domain: "Computer Architecture" },
			{ name: "CPU Architecture", domain: "Computer Architecture" },
			{ name: "Memory Hierarchy", domain: "Computer Architecture" },
			{ name: "Processes", domain: "Operating Systems" },
			{ name: "Threads", domain: "Operating Systems" },
			{ name: "CPU Scheduling", domain: "Operating Systems" },
			{ name: "Synchronization", domain: "Operating Systems" },
			{ name: "Deadlocks", domain: "Operating Systems" },
			{ name: "Virtual Memory", domain: "Operating Systems" },
			{ name: "Relational Databases", domain: "Database Systems" },
			{ name: "SQL", domain: "Database Systems" },
			{ name: "Normalization", domain: "Database Systems" },
			{ name: "Transactions", domain: "Database Systems" },
			{ name: "Network Fundamentals", domain: "Computer Networks" },
			{ name: "OSI Model", domain: "Computer Networks" },
			{ name: "TCP/IP", domain: "Computer Networks" },
			{ name: "IP Addressing", domain: "Computer Networks" },
			{ name: "AI Fundamentals", domain: "Artificial Intelligence" },
			{ name: "Machine Learning", domain: "Artificial Intelligence" },
			{ name: "Supervised Learning", domain: "Artificial Intelligence" },
			{ name: "Neural Networks", domain: "Artificial Intelligence" },
			{ name: "Deep Learning", domain: "Artificial Intelligence" },
			{ name: "Large Language Models", domain: "Artificial Intelligence" },
		];
		for (const d of domains) {
			data.skills.push({ id: makeId("skill"), name: d.name, domain: d.domain, createdAt: now(), updatedAt: now() });
		}
		save(data);
	},
	stats() {
		const data = load();
		const counts: Record<MasteryState, number> = { unfamiliar: 0, learning: 0, developing: 0, proficient: 0, mastered: 0 };
		for (const m of data.mastery) counts[m.state]++;
		const masteredSkills = new Set(data.mastery.map((m) => m.skillId));
		for (const s of data.skills) if (!masteredSkills.has(s.id)) counts.unfamiliar++;
		return { totalSkills: data.skills.length, counts, totalEvidence: data.evidence.length, totalMisconceptions: data.misconceptions.length };
	},
};
