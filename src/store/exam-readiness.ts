import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { learningStore } from "./learning.ts";
import {
	type ExamProfile,
	type Question,
	type Attempt,
	type ExamSession,
	DEFAULT_WEIGHTS,
	computeReadiness as computeReadinessCore,
	computePrediction as computePredictionCore,
	generateStudyPlan as generateStudyPlanCore,
} from "../core/exam-readiness.ts";

interface StoreData {
	exams: ExamProfile[];
	questions: Question[];
	sessions: ExamSession[];
	attempts: Attempt[];
}

const FILE = path.join(PATHS.data, "exam-readiness.json");

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		return {
			exams: parsed.exams ?? [],
			questions: parsed.questions ?? [],
			sessions: parsed.sessions ?? [],
			attempts: parsed.attempts ?? [],
		};
	} catch {
		return { exams: [], questions: [], sessions: [], attempts: [] };
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

export const examReadinessStore = {
	listExams(): ExamProfile[] {
		return load().exams.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	},
	getExam(id: string): ExamProfile | null {
		return load().exams.find((e) => e.id === id) ?? null;
	},
	createExam(input: Omit<ExamProfile, "id" | "createdAt" | "updatedAt">): ExamProfile {
		const data = load();
		const e: ExamProfile = {
			id: makeId("exam"),
			name: input.name,
			subject: input.subject,
			coverage: input.coverage,
			chapters: input.chapters,
			examDate: input.examDate,
			durationMinutes: input.durationMinutes,
			totalQuestions: input.totalQuestions,
			totalPoints: input.totalPoints,
			questionFormats: input.questionFormats,
			difficultyDistribution: input.difficultyDistribution,
			targetScore: input.targetScore,
			passingScore: input.passingScore,
			format: input.format,
			materialIds: input.materialIds,
			weights: input.weights ?? DEFAULT_WEIGHTS,
			createdAt: now(),
			updatedAt: now(),
		};
		data.exams.push(e);
		save(data);
		return e;
	},
	updateExam(id: string, patch: Partial<ExamProfile>): ExamProfile | null {
		const data = load();
		const idx = data.exams.findIndex((e) => e.id === id);
		if (idx < 0) return null;
		const cur = data.exams[idx];
		if (!cur) return null;
		data.exams[idx] = { ...cur, ...patch, id, updatedAt: now() } as ExamProfile;
		save(data);
		return data.exams[idx] ?? null;
	},
	deleteExam(id: string): boolean {
		const data = load();
		const before = data.exams.length;
		data.exams = data.exams.filter((e) => e.id !== id);
		data.questions = data.questions.filter((q) => q.examId !== id);
		data.sessions = data.sessions.filter((s) => s.examId !== id);
		data.attempts = data.attempts.filter((a) => a.examId !== id);
		save(data);
		return data.exams.length < before;
	},

	listQuestions(examId?: string): Question[] {
		const data = load();
		return examId ? data.questions.filter((q) => q.examId === examId) : data.questions;
	},
	getQuestion(id: string): Question | null {
		return load().questions.find((q) => q.id === id) ?? null;
	},
	addQuestion(q: Omit<Question, "id" | "createdAt">): Question {
		const data = load();
		const nq: Question = { ...q, id: makeId("q"), createdAt: now() };
		data.questions.push(nq);
		save(data);
		return nq;
	},
	addQuestions(qs: Omit<Question, "id" | "createdAt">[]): Question[] {
		const data = load();
		const out: Question[] = [];
		for (const q of qs) {
			const nq: Question = { ...q, id: makeId("q"), createdAt: now() };
			data.questions.push(nq);
			out.push(nq);
		}
		save(data);
		return out;
	},
	deleteQuestion(id: string): boolean {
		const data = load();
		const before = data.questions.length;
		data.questions = data.questions.filter((q) => q.id !== id);
		save(data);
		return data.questions.length < before;
	},

	listSessions(examId?: string): ExamSession[] {
		const data = load();
		const rows = examId ? data.sessions.filter((s) => s.examId === examId) : data.sessions;
		return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	},
	getSession(id: string): ExamSession | null {
		return load().sessions.find((s) => s.id === id) ?? null;
	},
	createSession(input: Omit<ExamSession, "id" | "startedAt" | "status" | "answers"> & { answers?: Record<string, string> }): ExamSession {
		const data = load();
		const s: ExamSession = {
			id: makeId("sess"),
			examId: input.examId!,
			mode: input.mode!,
			startedAt: now(),
			timeLimitSec: input.timeLimitSec,
			questionIds: input.questionIds!,
			answers: input.answers ?? {},
			status: "in-progress",
		};
		data.sessions.push(s);
		save(data);
		return s;
	},
	updateSession(id: string, patch: Partial<ExamSession>): ExamSession | null {
		const data = load();
		const idx = data.sessions.findIndex((s) => s.id === id);
		if (idx < 0) return null;
		const cur = data.sessions[idx];
		if (!cur) return null;
		data.sessions[idx] = { ...cur, ...patch };
		save(data);
		return data.sessions[idx] ?? null;
	},
	submitSession(id: string): ExamSession | null {
		const data = load();
		const idx = data.sessions.findIndex((s) => s.id === id);
		if (idx < 0) return null;
		const cur = data.sessions[idx];
		if (!cur) return null;
		cur.status = "submitted";
		cur.submittedAt = now();
		save(data);
		return cur;
	},

	listAttempts(examId?: string, topic?: string): Attempt[] {
		const data = load();
		let rows = examId ? data.attempts.filter((a) => a.examId === examId) : data.attempts;
		if (topic) rows = rows.filter((a) => a.topic === topic);
		return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
	},
	recordAttempt(input: Omit<Attempt, "id" | "submittedAt">): Attempt {
		const data = load();
		const prior = data.attempts
			.filter((a) => a.examId === input.examId && a.topic === input.topic)
			.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
		let delayed = input.delayed;
		let daysSincePrior = input.daysSincePrior;
		if (prior && delayed === undefined) {
			const days = (Date.now() - new Date(prior.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
			if (days >= 2) {
				delayed = true;
				daysSincePrior = Math.round(days * 10) / 10;
			} else {
				delayed = false;
			}
		}
		const a: Attempt = {
			...input,
			id: makeId("att"),
			submittedAt: now(),
			delayed: delayed ?? false,
			daysSincePrior,
		};
		data.attempts.push(a);
		save(data);
		try {
			const skill = learningStore.listSkills().find((s) => s.name.toLowerCase() === input.topic.toLowerCase());
			if (skill) {
				learningStore.addEvidence({
					skillId: skill.id,
					sourceType: "diagnostic",
					correct: input.correct,
					score: input.score,
					independent: input.independent,
					hintUsed: input.hintUsed,
				});
			}
		} catch {
			// ignore
		}
		return a;
	},
	recordAttempts(inputs: Omit<Attempt, "id" | "submittedAt">[]): Attempt[] {
		return inputs.map((i) => this.recordAttempt(i));
	},

	getReadiness(examId: string) {
		const data = load();
		const exam = data.exams.find((e) => e.id === examId);
		if (!exam) return null;
		return computeReadinessCore(exam, data.attempts, data.sessions);
	},
	getPrediction(examId: string) {
		const data = load();
		const exam = data.exams.find((e) => e.id === examId);
		if (!exam) return null;
		const r = computeReadinessCore(exam, data.attempts, data.sessions);
		return computePredictionCore(exam, r);
	},
	getStudyPlan(examId: string) {
		const data = load();
		const exam = data.exams.find((e) => e.id === examId);
		if (!exam) return null;
		const r = computeReadinessCore(exam, data.attempts, data.sessions);
		return generateStudyPlanCore(exam, r);
	},

	generateQuestions(examId: string, count = 10): Question[] {
		const data = load();
		const exam = data.exams.find((e) => e.id === examId);
		if (!exam) return [];
		const topics = exam.coverage.length ? exam.coverage : ["General"];
		const diffs: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
		const dims: ("conceptual" | "problem-solving" | "application")[] = ["conceptual", "problem-solving", "application"];
		const out: Omit<Question, "id" | "createdAt">[] = [];
		let i = 0;
		while (out.length < count) {
			const topic = topics[i % topics.length]!;
			const difficulty = diffs[i % diffs.length]!;
			const dimension = dims[i % dims.length]!;
			const type: Question["type"] = dimension === "conceptual" ? "mc" : dimension === "problem-solving" ? "problem" : "short-answer";
			out.push({
				examId,
				topic,
				type,
				dimension,
				difficulty,
				prompt: `[${difficulty.toUpperCase()}] ${topic}: ${dimension === "conceptual" ? "Which statement is correct?" : dimension === "problem-solving" ? "Solve a representative problem involving " + topic + "." : "Apply " + topic + " to an unfamiliar scenario."}`,
				options: type === "mc" ? ["Correct principle", "Related but wrong principle", "Common misconception", "Irrelevant principle"] : undefined,
				correctAnswer: type === "mc" ? "Correct principle" : undefined,
				points: difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1,
			});
			i++;
		}
		return this.addQuestions(out);
	},
};
