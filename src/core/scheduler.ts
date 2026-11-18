export type Rating = "again" | "hard" | "good" | "easy";

export interface Schedulable {
	state: "new" | "learning" | "review" | "relearning";
	scheduling: {
		due: string;
		stability: number;
		difficulty: number;
		reps: number;
		lapses: number;
		lastReview?: string;
		step?: number;
	};
}

const LEARNING_STEPS_MIN = [1, 10];
const RELEARNING_STEPS_MIN = [10];
const DESIRED_RETENTION = 0.9;

function addMinutes(date: Date, mins: number): string {
	return new Date(date.getTime() + mins * 60 * 1000).toISOString();
}
function addDays(date: Date, days: number): string {
	return new Date(date.getTime() + days * 86400000).toISOString();
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, x));
}

function initialStability(rating: Rating): number {
	switch (rating) {
		case "again": return 0.4;
		case "hard": return 1.2;
		case "good": return 2.4;
		case "easy": return 4.8;
	}
}
function initialDifficulty(rating: Rating): number {
	switch (rating) {
		case "again": return 8;
		case "hard": return 6;
		case "good": return 5;
		case "easy": return 3;
	}
}

export function schedule(card: Schedulable, rating: Rating, now: Date = new Date()): Schedulable {
	const s = card.scheduling;
	const next: Schedulable = {
		state: card.state,
		scheduling: { ...s, lastReview: now.toISOString(), reps: s.reps + 1 },
	};

	switch (card.state) {
		case "new": {
			next.scheduling.difficulty = initialDifficulty(rating);
			next.scheduling.stability = initialStability(rating);
			if (rating === "again" || rating === "hard") {
				next.state = "learning";
				next.scheduling.step = 0;
				next.scheduling.due = addMinutes(now, LEARNING_STEPS_MIN[0]!);
			} else if (rating === "good") {
				next.state = "learning";
				next.scheduling.step = 1;
				const mins = LEARNING_STEPS_MIN[1] ?? 10;
				next.scheduling.due = addMinutes(now, mins);
			} else {
				// easy: graduate
				next.state = "review";
				next.scheduling.step = undefined;
				next.scheduling.due = addDays(now, 4);
			}
			break;
		}
		case "learning": {
			const step = s.step ?? 0;
			if (rating === "again") {
				next.state = "learning";
				next.scheduling.step = 0;
				next.scheduling.due = addMinutes(now, LEARNING_STEPS_MIN[0]!);
				next.scheduling.lapses = s.lapses + 1;
			} else if (rating === "hard") {
				next.state = "learning";
				next.scheduling.step = step;
				next.scheduling.due = addMinutes(now, Math.max(1, (LEARNING_STEPS_MIN[step] ?? 1) * 2));
			} else if (rating === "good") {
				const nextStep = step + 1;
				if (nextStep >= LEARNING_STEPS_MIN.length) {
					next.state = "review";
					next.scheduling.step = undefined;
					next.scheduling.due = addDays(now, Math.max(1, Math.round(next.scheduling.stability)));
				} else {
					next.state = "learning";
					next.scheduling.step = nextStep;
					next.scheduling.due = addMinutes(now, LEARNING_STEPS_MIN[nextStep]!);
				}
			} else {
				// easy: graduate with longer interval
				next.state = "review";
				next.scheduling.step = undefined;
				next.scheduling.due = addDays(now, Math.max(2, Math.round(next.scheduling.stability * 2)));
			}
			break;
		}
		case "review": {
			const elapsedDays = s.lastReview ? (now.getTime() - new Date(s.lastReview).getTime()) / 86400000 : 0;
			const retrievability = Math.exp(-elapsedDays / Math.max(0.1, s.stability));
			// update difficulty
			const newD = clamp(s.difficulty + (rating === "again" ? 1 : rating === "hard" ? 0.5 : rating === "good" ? 0 : -0.5), 1, 10);
			next.scheduling.difficulty = newD;
			if (rating === "again") {
				next.state = "relearning";
				next.scheduling.step = 0;
				next.scheduling.lapses = s.lapses + 1;
				next.scheduling.due = addMinutes(now, RELEARNING_STEPS_MIN[0]!);
				// stability drops
				next.scheduling.stability = Math.max(0.1, s.stability * 0.3);
			} else {
				next.state = "review";
				// stability growth
				const factor = rating === "hard" ? 1.2 : rating === "good" ? Math.max(1.3, 3 - newD * 0.1) : Math.max(1.5, 4 - newD * 0.1);
				next.scheduling.stability = s.stability * factor;
				const interval = Math.max(1, Math.round(next.scheduling.stability * DESIRED_RETENTION * (rating === "easy" ? 1.3 : 1)));
				next.scheduling.due = addDays(now, interval);
			}
			break;
		}
		case "relearning": {
			if (rating === "again") {
				next.state = "relearning";
				next.scheduling.step = 0;
				next.scheduling.due = addMinutes(now, RELEARNING_STEPS_MIN[0]!);
			} else {
				next.state = "review";
				next.scheduling.step = undefined;
				next.scheduling.due = addDays(now, Math.max(1, Math.round(next.scheduling.stability || 1)));
			}
			break;
		}
	}
	return next;
}
