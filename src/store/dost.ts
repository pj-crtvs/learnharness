import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

export type Domain = "reading" | "spatial" | "math" | "science";

export interface ExamQuestion {
	id: string;
	domain: Domain;
	topic: string;
	difficulty: 1 | 2 | 3 | 4 | 5;
	type: "mcq";
	stem: string; // may include SVG markup
	choices: { id: string; text?: string; svg?: string }[];
	correct: string;
	explanation: string;
	visual?: string;
	estimatedTime: number;
}

export interface ExamAttempt {
	id: string;
	questionId: string;
	domain: Domain;
	answer: string;
	correct: boolean;
	timeSpent: number;
	timestamp: string;
}

interface StoreData {
	questions: ExamQuestion[];
	attempts: ExamAttempt[];
	examDate?: string;
}

const FILE = path.join(PATHS.data, "dost.json");

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		return { questions: parsed.questions ?? [], attempts: parsed.attempts ?? [], examDate: parsed.examDate };
	} catch {
		return { questions: [], attempts: [] };
	}
}
function save(data: StoreData): void {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}
function now(): string { return new Date().toISOString(); }
function makeId(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

// --- Spatial SVG generators ---
function shapeSvg(points: [number, number][], size = 120): string {
	const pts = points.map(([x, y]) => `${x},${y}`).join(" ");
	return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><polygon points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function rotatePoints(points: [number, number][], deg: number, cx = 60, cy = 60): [number, number][] {
	const r = (deg * Math.PI) / 180;
	return points.map(([x, y]) => {
		const dx = x - cx, dy = y - cy;
		return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)] as [number, number];
	});
}

function mirrorPoints(points: [number, number][]): [number, number][] {
	return points.map(([x, y]) => [120 - x, y] as [number, number]);
}

const baseTriangle: [number, number][] = [[60, 20], [100, 100], [20, 100]];

function makeSpatialQuestions(): ExamQuestion[] {
	const qs: ExamQuestion[] = [];
	// rotation
	for (let i = 0; i < 5; i++) {
		const deg = (i + 1) * 90;
		const rotated = rotatePoints(baseTriangle, deg);
		const distractors = [0, 90, 180, 270].filter((d) => d !== (deg % 360)).map((d) => rotatePoints(baseTriangle, d));
		const choices = [rotated, ...distractors].map((pts, idx) => ({ id: String.fromCharCode(65 + idx), svg: shapeSvg(pts) }));
		qs.push({
			id: makeId("sp"),
			domain: "spatial",
			topic: "Mental Rotation",
			difficulty: 2,
			type: "mcq",
			stem: `Which figure is the original triangle rotated ${deg}° clockwise? Original: ${shapeSvg(baseTriangle)}`,
			choices,
			correct: "A",
			explanation: `Rotating the triangle ${deg}° clockwise yields the first option.`,
			estimatedTime: 45,
		});
	}
	// mirror
	for (let i = 0; i < 3; i++) {
		const mirrored = mirrorPoints(baseTriangle);
		const choices = [
			{ id: "A", svg: shapeSvg(mirrored) },
			{ id: "B", svg: shapeSvg(baseTriangle) },
			{ id: "C", svg: shapeSvg(rotatePoints(baseTriangle, 90)) },
			{ id: "D", svg: shapeSvg(rotatePoints(baseTriangle, 180)) },
		];
		qs.push({
			id: makeId("sp"),
			domain: "spatial",
			topic: "Mirror Image",
			difficulty: 2,
			type: "mcq",
			stem: `Which figure is the mirror image of the original? Original: ${shapeSvg(baseTriangle)}`,
			choices,
			correct: "A",
			explanation: "Reflecting across the vertical axis gives the mirror image.",
			estimatedTime: 45,
		});
	}
	return qs;
}

function makeMathQuestions(): ExamQuestion[] {
	const qs: ExamQuestion[] = [];
	const items = [
		{ stem: "What is 15% of 240?", choices: ["30", "36", "40", "45"], correct: "B", topic: "Percentages", diff: 2, exp: "0.15×240=36." },
		{ stem: "Solve for x: 2x + 5 = 17", choices: ["4", "5", "6", "7"], correct: "C", topic: "Linear Equations", diff: 2, exp: "2x=12 → x=6." },
		{ stem: "Area of a circle with radius 7 (use π=22/7):", choices: ["154", "144", "164", "174"], correct: "A", topic: "Geometry", diff: 2, exp: "πr² = (22/7)×49 = 154." },
		{ stem: "If a car travels 120 km in 2 hours, its average speed is:", choices: ["50", "55", "60", "65"], correct: "C", topic: "Rate", diff: 1, exp: "120/2=60 km/h." },
		{ stem: "Simplify: (x² - 9)/(x - 3)", choices: ["x+3", "x-3", "x²+3", "x²-3"], correct: "A", topic: "Algebra", diff: 3, exp: "Factor: (x-3)(x+3)/(x-3)=x+3." },
	];
	for (const it of items) {
		qs.push({
			id: makeId("math"),
			domain: "math",
			topic: it.topic,
			difficulty: it.diff as 1 | 2 | 3 | 4 | 5,
			type: "mcq",
			stem: it.stem,
			choices: it.choices.map((c, i) => ({ id: String.fromCharCode(65 + i), text: c })),
			correct: it.correct,
			explanation: it.exp,
			estimatedTime: 60,
		});
	}
	return qs;
}

function makeScienceQuestions(): ExamQuestion[] {
	const qs: ExamQuestion[] = [];
	const items = [
		{ stem: "The powerhouse of the cell is the:", choices: ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"], correct: "B", topic: "Biology", diff: 1, exp: "Mitochondria produce ATP." },
		{ stem: "Water boils at 100°C at:", choices: ["Sea level", "High altitude", "Low pressure", "Vacuum"], correct: "A", topic: "Physics", diff: 1, exp: "Standard boiling point at 1 atm." },
		{ stem: "The pH of a neutral solution is:", choices: ["0", "7", "14", "1"], correct: "B", topic: "Chemistry", diff: 1, exp: "Neutral pH is 7." },
		{ stem: "Earth's outermost layer is the:", choices: ["Mantle", "Core", "Crust", "Magma"], correct: "C", topic: "Earth Science", diff: 1, exp: "The crust is the outermost solid layer." },
	];
	for (const it of items) {
		qs.push({
			id: makeId("sci"),
			domain: "science",
			topic: it.topic,
			difficulty: it.diff as 1 | 2 | 3 | 4 | 5,
			type: "mcq",
			stem: it.stem,
			choices: it.choices.map((c, i) => ({ id: String.fromCharCode(65 + i), text: c })),
			correct: it.correct,
			explanation: it.exp,
			estimatedTime: 45,
		});
	}
	return qs;
}

function makeReadingQuestions(): ExamQuestion[] {
	const passage = "The rapid advancement of artificial intelligence has transformed many industries. While AI systems can process vast amounts of data quickly, they also raise concerns about privacy, bias, and employment. Experts emphasize that responsible development and regulation are essential to ensure that AI benefits society as a whole.";
	const qs: ExamQuestion[] = [
		{
			id: makeId("read"),
			domain: "reading",
			topic: "Main Idea",
			difficulty: 2,
			type: "mcq",
			stem: `Passage: "${passage}"\n\nWhat is the main idea of the passage?`,
			choices: [
				{ id: "A", text: "AI is too dangerous to use." },
				{ id: "B", text: "AI brings benefits and risks, requiring responsible development." },
				{ id: "C", text: "AI will replace all workers." },
				{ id: "D", text: "Privacy is the only concern with AI." },
			],
			correct: "B",
			explanation: "The passage balances benefits and risks and calls for responsible development.",
			estimatedTime: 60,
		},
	];
	return qs;
}

export const dostStore = {
	ensureQuestions(): void {
		const data = load();
		if (data.questions.length > 0) return;
		const qs = [...makeSpatialQuestions(), ...makeMathQuestions(), ...makeScienceQuestions(), ...makeReadingQuestions()];
		data.questions = qs;
		save(data);
	},
	listQuestions(domain?: Domain): ExamQuestion[] {
		this.ensureQuestions();
		const data = load();
		return domain ? data.questions.filter((q) => q.domain === domain) : data.questions;
	},
	getQuestion(id: string): ExamQuestion | null {
		this.ensureQuestions();
		return load().questions.find((q) => q.id === id) ?? null;
	},
	recordAttempt(attempt: Omit<ExamAttempt, "id" | "timestamp">): ExamAttempt {
		const data = load();
		const a: ExamAttempt = { id: makeId("att"), ...attempt, timestamp: now() };
		data.attempts.push(a);
		save(data);
		return a;
	},
	listAttempts(domain?: Domain): ExamAttempt[] {
		const data = load();
		return domain ? data.attempts.filter((a) => a.domain === domain) : data.attempts;
	},
	setExamDate(date: string): void {
		const data = load();
		data.examDate = date;
		save(data);
	},
	getExamDate(): string | undefined {
		return load().examDate;
	},
	stats() {
		this.ensureQuestions();
		const data = load();
		const byDomain: Record<Domain, { total: number; correct: number }> = { reading: { total: 0, correct: 0 }, spatial: { total: 0, correct: 0 }, math: { total: 0, correct: 0 }, science: { total: 0, correct: 0 } };
		for (const a of data.attempts) {
			byDomain[a.domain].total++;
			if (a.correct) byDomain[a.domain].correct++;
		}
		return { totalQuestions: data.questions.length, totalAttempts: data.attempts.length, byDomain, examDate: data.examDate };
	},
};
