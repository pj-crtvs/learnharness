export type DifficultyLevel = "easy" | "medium" | "hard";
export type QuestionType =
	| "mc"
	| "problem"
	| "conceptual"
	| "short-answer"
	| "code-trace"
	| "derivation"
	| "diagram"
	| "graph";
export type QuestionDimension = "conceptual" | "problem-solving" | "retention" | "application" | "timed";
export type ExamMode = "diagnostic" | "practice" | "exam-sim" | "delayed";
export type ReadinessStatus =
	| "insufficient-data"
	| "not-ready"
	| "needs-significant-preparation"
	| "developing"
	| "nearly-ready"
	| "exam-ready"
	| "strong-mastery";

export interface ReadinessWeights {
	conceptual: number;
	problemSolving: number;
	retention: number;
	application: number;
	timed: number;
	consistency: number;
}

export const DEFAULT_WEIGHTS: ReadinessWeights = {
	conceptual: 0.2,
	problemSolving: 0.25,
	retention: 0.2,
	application: 0.15,
	timed: 0.15,
	consistency: 0.05,
};

export interface ExamProfile {
	id: string;
	name: string;
	subject: string;
	coverage: string[];
	chapters?: string[];
	examDate: string;
	durationMinutes: number;
	totalQuestions: number;
	totalPoints: number;
	questionFormats: QuestionType[];
	difficultyDistribution?: { easy: number; medium: number; hard: number };
	targetScore: number;
	passingScore: number;
	format?: string;
	materialIds?: string[];
	weights?: ReadinessWeights;
	createdAt: string;
	updatedAt: string;
}

export interface Question {
	id: string;
	examId: string;
	topic: string;
	type: QuestionType;
	dimension: QuestionDimension;
	difficulty: DifficultyLevel;
	prompt: string;
	options?: string[];
	correctAnswer?: string;
	points: number;
	sourceRef?: { document?: string; page?: number };
	createdAt: string;
}

export interface Attempt {
	id: string;
	examId: string;
	sessionId?: string;
	questionId: string;
	topic: string;
	dimension: QuestionDimension;
	difficulty: DifficultyLevel;
	correct: boolean;
	score: number;
	independent: boolean;
	hintUsed: boolean;
	timeSpentSec: number;
	submittedAt: string;
	delayed?: boolean;
	daysSincePrior?: number;
}

export interface ExamSession {
	id: string;
	examId: string;
	mode: ExamMode;
	startedAt: string;
	submittedAt?: string;
	timeLimitSec?: number;
	questionIds: string[];
	answers: Record<string, string>;
	status: "in-progress" | "submitted" | "expired";
}

export interface TopicReadiness {
	topic: string;
	score: number | null;
	status: string;
	evidenceCount: number;
	accuracy: number | null;
	delayedRecall: number | null;
	avgTimeSec: number | null;
	difficultyBreakdown: { easy: number | null; medium: number | null; hard: number | null };
	independentRate: number | null;
	lastAttemptAt?: string;
}

export interface DimensionResult {
	score: number | null;
	evidenceCount: number;
}

export interface ReadinessResult {
	overall: number | null;
	status: ReadinessStatus;
	dimensions: Record<keyof ReadinessWeights, DimensionResult>;
	topics: TopicReadiness[];
	confidence: "low" | "moderate" | "strong";
	confidenceReason: string;
	evidenceCount: number;
	insufficientReason?: string;
}

export interface Prediction {
	estimatedScore: number | null;
	estimatedRange: [number, number] | null;
	probPass: number | null;
	probTarget: number | null;
	confidence: "low" | "moderate" | "strong";
	factors: string[];
	provisional: boolean;
}

export interface StudyRecommendation {
	id: string;
	priority: number;
	title: string;
	description: string;
	topic?: string;
	action: { kind: "practice" | "flashcards" | "review" | "lesson" | "assessment"; href: string };
}

export function diffWeight(d: DifficultyLevel): number {
	return d === "easy" ? 1 : d === "medium" ? 1.5 : 2;
}

export function attemptEffectiveScore(a: Attempt): number {
	let s = a.score;
	if (!a.independent) s *= 0.85;
	if (a.hintUsed) s *= 0.8;
	return Math.max(0, Math.min(1, s));
}

function stddev(xs: number[]): number {
	if (xs.length < 2) return 0;
	const m = xs.reduce((a, b) => a + b, 0) / xs.length;
	return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export function computeTopicReadiness(topic: string, attempts: Attempt[]): TopicReadiness {
	const tas = attempts.filter((a) => a.topic === topic);
	if (tas.length === 0) {
		return {
			topic,
			score: null,
			status: "no-data",
			evidenceCount: 0,
			accuracy: null,
			delayedRecall: null,
			avgTimeSec: null,
			difficultyBreakdown: { easy: null, medium: null, hard: null },
			independentRate: null,
		};
	}
	const correct = tas.filter((a) => a.correct).length;
	const accuracy = correct / tas.length;
	const delayed = tas.filter((a) => a.delayed);
	const delayedRecall = delayed.length ? delayed.filter((a) => a.correct).length / delayed.length : null;
	const avgTimeSec = tas.reduce((a, b) => a + b.timeSpentSec, 0) / tas.length;
	const independentRate = tas.filter((a) => a.independent).length / tas.length;
	const diffBreakdown = (d: DifficultyLevel) => {
		const sub = tas.filter((a) => a.difficulty === d);
		if (sub.length === 0) return null;
		return sub.filter((a) => a.correct).length / sub.length;
	};
	let num = 0;
	let den = 0;
	for (const a of tas) {
		num += attemptEffectiveScore(a) * diffWeight(a.difficulty);
		den += diffWeight(a.difficulty);
	}
	const score = den > 0 ? (num / den) * 100 : null;
	let status = "no-data";
	if (score !== null) {
		if (score < 40) status = "weak";
		else if (score < 60) status = "needs-work";
		else if (score < 75) status = "developing";
		else if (score < 85) status = "ready";
		else status = "strong";
	}
	return {
		topic,
		score: score === null ? null : Math.round(score * 10) / 10,
		status,
		evidenceCount: tas.length,
		accuracy: Math.round(accuracy * 1000) / 10,
		delayedRecall: delayedRecall === null ? null : Math.round(delayedRecall * 1000) / 10,
		avgTimeSec: Math.round(avgTimeSec * 10) / 10,
		difficultyBreakdown: {
			easy: diffBreakdown("easy"),
			medium: diffBreakdown("medium"),
			hard: diffBreakdown("hard"),
		},
		independentRate: Math.round(independentRate * 1000) / 10,
		lastAttemptAt: tas[tas.length - 1]?.submittedAt,
	};
}

export function computeDimension(attempts: Attempt[], dim: QuestionDimension): DimensionResult {
	const sub = attempts.filter((a) => a.dimension === dim);
	if (sub.length === 0) return { score: null, evidenceCount: 0 };
	let num = 0;
	let den = 0;
	for (const a of sub) {
		num += attemptEffectiveScore(a) * diffWeight(a.difficulty);
		den += diffWeight(a.difficulty);
	}
	const score = den > 0 ? (num / den) * 100 : null;
	return { score: score === null ? null : Math.round(score * 10) / 10, evidenceCount: sub.length };
}

export function classifyReadiness(score: number | null): ReadinessStatus {
	if (score === null) return "insufficient-data";
	if (score < 40) return "not-ready";
	if (score < 60) return "needs-significant-preparation";
	if (score < 75) return "developing";
	if (score < 85) return "nearly-ready";
	if (score < 95) return "exam-ready";
	return "strong-mastery";
}

export function computeReadiness(
	exam: ExamProfile,
	_attempts: Attempt[],
	_sessions: ExamSession[],
	weights?: ReadinessWeights,
): ReadinessResult {
	const w = weights ?? exam.weights ?? DEFAULT_WEIGHTS;
	const attempts = _attempts.filter((a) => a.examId === exam.id);
	const sessions = _sessions.filter((s) => s.examId === exam.id);

	const topics = exam.coverage.map((t) => computeTopicReadiness(t, attempts));

	const dims: Record<keyof ReadinessWeights, QuestionDimension | "consistency"> = {
		conceptual: "conceptual",
		problemSolving: "problem-solving",
		retention: "retention",
		application: "application",
		timed: "timed",
		consistency: "consistency",
	};

	const dimensionResults = {} as Record<keyof ReadinessWeights, DimensionResult>;
	for (const key of Object.keys(w) as (keyof ReadinessWeights)[]) {
		if (key === "consistency") {
			const topicScores = topics.map((t) => t.score).filter((s): s is number => s !== null);
			if (topicScores.length < 2) {
				dimensionResults.consistency = { score: null, evidenceCount: topicScores.length };
				continue;
			}
			const sd = stddev(topicScores);
			const score = Math.max(0, Math.min(100, 100 - sd * 1.5));
			dimensionResults.consistency = { score: Math.round(score * 10) / 10, evidenceCount: topicScores.length };
		} else {
			dimensionResults[key] = computeDimension(attempts, dims[key] as QuestionDimension);
		}
	}

	const evidenceCount = attempts.length;

	const nonNullDims = (Object.keys(dimensionResults) as (keyof ReadinessWeights)[]).filter(
		(k) => dimensionResults[k].score !== null,
	);
	if (evidenceCount < 5 || nonNullDims.length < 2) {
		return {
			overall: null,
			status: "insufficient-data",
			dimensions: dimensionResults,
			topics,
			confidence: "low",
			confidenceReason:
				evidenceCount < 5
					? `Only ${evidenceCount} recorded attempt(s); need at least 5.`
					: `Only ${nonNullDims.length} of 6 dimensions have evidence; need at least 2.`,
			evidenceCount,
			insufficientReason:
				evidenceCount < 5
					? "Not enough attempts recorded."
					: "Not enough dimensional evidence.",
		};
	}

	let num = 0;
	let den = 0;
	for (const key of Object.keys(w) as (keyof ReadinessWeights)[]) {
		const s = dimensionResults[key].score;
		if (s === null) continue;
		num += s * w[key];
		den += w[key];
	}
	const overall = den > 0 ? num / den : null;
	const o = overall === null ? null : Math.round(overall * 10) / 10;

	let confidence: "low" | "moderate" | "strong" = "low";
	let confidenceReason = "Limited evidence.";
	if (evidenceCount >= 30 && nonNullDims.length >= 4) {
		confidence = "strong";
		confidenceReason = "Substantial evidence across multiple dimensions.";
	} else if (evidenceCount >= 15 && nonNullDims.length >= 3) {
		confidence = "moderate";
		confidenceReason = "Moderate evidence base.";
	} else {
		confidence = "low";
		confidenceReason = "Small evidence base; treat as provisional.";
	}

	return {
		overall: o,
		status: classifyReadiness(o),
		dimensions: dimensionResults,
		topics,
		confidence,
		confidenceReason,
		evidenceCount,
	};
}

export function computePrediction(exam: ExamProfile, readiness: ReadinessResult): Prediction {
	if (readiness.overall === null) {
		return {
			estimatedScore: null,
			estimatedRange: null,
			probPass: null,
			probTarget: null,
			confidence: "low",
			factors: ["Insufficient evidence to estimate performance."],
			provisional: true,
		};
	}
	const center = readiness.overall;
	const margin = readiness.confidence === "strong" ? 6 : readiness.confidence === "moderate" ? 9 : 12;
	const lo = Math.max(0, Math.round((center - margin) * 10) / 10);
	const hi = Math.min(100, Math.round((center + margin) * 10) / 10);
	const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
	const probPass = Math.round(sigmoid((center - exam.passingScore) / 8) * 100);
	const probTarget = Math.round(sigmoid((center - exam.targetScore) / 8) * 100);
	const factors: string[] = [];
	const weakTopics = readiness.topics.filter((t) => t.score !== null && (t.score as number) < 60);
	for (const t of weakTopics.slice(0, 3)) factors.push(`Weak topic: ${t.topic} (${t.score}%).`);
	for (const [k, v] of Object.entries(readiness.dimensions)) {
		if (v.score !== null && v.score < 60) factors.push(`Low ${k} score (${v.score}%).`);
	}
	if (weakTopics.length === 0 && factors.length === 0) factors.push("No major risk factors detected.");
	return {
		estimatedScore: center,
		estimatedRange: [lo, hi],
		probPass,
		probTarget,
		confidence: readiness.confidence,
		factors,
		provisional: true,
	};
}

export function generateStudyPlan(
	exam: ExamProfile,
	readiness: ReadinessResult,
	nowDate: Date = new Date(),
): StudyRecommendation[] {
	const recs: StudyRecommendation[] = [];
	const daysUntil = Math.ceil((new Date(exam.examDate).getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
	const weakTopics = readiness.topics
		.filter((t) => t.score === null || (t.score as number) < 85)
		.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

	let prio = 1;
	for (const t of weakTopics.slice(0, 4)) {
		recs.push({
			id: `rec-prereq-${t.topic}`,
			priority: prio++,
			title: `Review prerequisites for ${t.topic}`,
			description: `Strengthen foundations for ${t.topic} before practicing.`,
			topic: t.topic,
			action: { kind: "review", href: "/learning" },
		});
		recs.push({
			id: `rec-practice-${t.topic}`,
			priority: prio++,
			title: `Complete practice problems: ${t.topic}`,
			description: `Solve targeted problems to improve ${t.topic}.`,
			topic: t.topic,
			action: { kind: "practice", href: `/exam-readiness?exam=${exam.id}&action=practice&topic=${encodeURIComponent(t.topic)}` },
		});
		if (t.delayedRecall === null || (t.delayedRecall as number) < 70) {
			recs.push({
				id: `rec-flashcards-${t.topic}`,
				priority: prio++,
				title: `Review flashcards for ${t.topic}`,
				description: `Reinforce retention for ${t.topic}.`,
				topic: t.topic,
				action: { kind: "flashcards", href: "/flashcards" },
			});
		}
	}
	recs.push({
		id: "rec-mixed-assessment",
		priority: prio++,
		title: "Complete a mixed-topic assessment",
		description: "Simulate exam conditions across all coverage topics.",
		action: { kind: "assessment", href: `/exam-readiness?exam=${exam.id}&action=exam-sim` },
	});
	if (daysUntil <= 7) {
		recs.unshift({
			id: "rec-urgent",
			priority: 0,
			title: "Exam approaching: focus on weakest topics",
			description: `Only ${daysUntil} day(s) until ${exam.name}. Prioritize weak areas.`,
			action: { kind: "assessment", href: `/exam-readiness?exam=${exam.id}&action=exam-sim` },
		});
	}
	return recs.slice(0, 8);
}
