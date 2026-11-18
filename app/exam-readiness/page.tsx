"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Exam = {
	id: string;
	name: string;
	subject: string;
	coverage: string[];
	examDate: string;
	durationMinutes: number;
	totalQuestions: number;
	totalPoints: number;
	targetScore: number;
	passingScore: number;
};

type Topic = {
	topic: string;
	score: number | null;
	status: string;
	evidenceCount: number;
	accuracy: number | null;
	delayedRecall: number | null;
	avgTimeSec: number | null;
};

type Readiness = {
	overall: number | null;
	status: string;
	dimensions: Record<string, { score: number | null; evidenceCount: number }>;
	topics: Topic[];
	confidence: string;
	confidenceReason: string;
	evidenceCount: number;
	insufficientReason?: string;
};

type Prediction = {
	estimatedScore: number | null;
	estimatedRange: [number, number] | null;
	probPass: number | null;
	probTarget: number | null;
	confidence: string;
	factors: string[];
	provisional: boolean;
};

type Rec = {
	id: string;
	priority: number;
	title: string;
	description: string;
	topic?: string;
	action: { kind: string; href: string };
};

type Question = {
	id: string;
	examId: string;
	topic: string;
	type: string;
	dimension: string;
	difficulty: string;
	prompt: string;
	options?: string[];
	correctAnswer?: string;
	points: number;
};

type Session = {
	id: string;
	examId: string;
	mode: string;
	status: string;
	questionIds: string[];
	answers: Record<string, string>;
	timeLimitSec?: number;
	startedAt: string;
	submittedAt?: string;
};

export default function ExamReadinessPage() {
	const [exams, setExams] = useState<Exam[]>([]);
	const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
	const [readiness, setReadiness] = useState<Readiness | null>(null);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [plan, setPlan] = useState<Rec[]>([]);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeSession, setActiveSession] = useState<Session | null>(null);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [timeLeft, setTimeLeft] = useState<number | null>(null);
	const [showCreate, setShowCreate] = useState(false);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({
		name: "",
		subject: "",
		coverage: "",
		examDate: "",
		durationMinutes: "120",
		totalQuestions: "40",
		totalPoints: "100",
		targetScore: "90",
		passingScore: "60",
	});

	const loadExams = useCallback(async () => {
		const res = await fetch("/api/exam-readiness/exams", { cache: "no-store" });
		const data = await res.json();
		setExams(data.exams ?? []);
		if (!selectedExamId && (data.exams ?? []).length > 0) {
			setSelectedExamId(data.exams[0].id);
		}
	}, [selectedExamId]);

	useEffect(() => {
		void loadExams();
	}, [loadExams]);

	const selectedExam = exams.find((e) => e.id === selectedExamId) ?? null;

	const refreshAll = useCallback(async () => {
		if (!selectedExamId) return;
		const [rRes, pRes, plRes, qRes, sRes] = await Promise.all([
			fetch(`/api/exam-readiness/readiness?examId=${selectedExamId}`, { cache: "no-store" }),
			fetch(`/api/exam-readiness/prediction?examId=${selectedExamId}`, { cache: "no-store" }),
			fetch(`/api/exam-readiness/study-plan?examId=${selectedExamId}`, { cache: "no-store" }),
			fetch(`/api/exam-readiness/questions?examId=${selectedExamId}`, { cache: "no-store" }),
			fetch(`/api/exam-readiness/sessions?examId=${selectedExamId}`, { cache: "no-store" }),
		]);
		const r = await rRes.json();
		const p = await pRes.json();
		const pl = await plRes.json();
		const q = await qRes.json();
		const s = await sRes.json();
		setReadiness(r.readiness ?? null);
		setPrediction(p.prediction ?? null);
		setPlan(pl.plan ?? []);
		setQuestions(q.questions ?? []);
		setSessions(s.sessions ?? []);
	}, [selectedExamId]);

	useEffect(() => {
		void refreshAll();
	}, [refreshAll]);

	useEffect(() => {
		if (!activeSession || activeSession.status !== "in-progress" || !activeSession.timeLimitSec) return;
		const start = new Date(activeSession.startedAt).getTime();
		const end = start + activeSession.timeLimitSec * 1000;
		const tick = () => {
			const left = Math.max(0, Math.round((end - Date.now()) / 1000));
			setTimeLeft(left);
			if (left <= 0) {
				void submitSession(true);
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [activeSession]);

	const createExam = async () => {
		setCreating(true);
		try {
			const body = {
				name: form.name,
				subject: form.subject,
				coverage: form.coverage.split(",").map((s) => s.trim()).filter(Boolean),
				examDate: form.examDate ? new Date(form.examDate).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
				durationMinutes: Number(form.durationMinutes),
				totalQuestions: Number(form.totalQuestions),
				totalPoints: Number(form.totalPoints),
				questionFormats: ["mc", "problem", "short-answer"],
				targetScore: Number(form.targetScore),
				passingScore: Number(form.passingScore),
				format: "written",
			};
			const res = await fetch("/api/exam-readiness/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
			const data = await res.json();
			if (data.exam) {
				setSelectedExamId(data.exam.id);
				setShowCreate(false);
				await loadExams();
			}
		} finally {
			setCreating(false);
		}
	};

	const generateQuestions = async () => {
		if (!selectedExamId) return;
		await fetch("/api/exam-readiness/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: selectedExamId, count: 12 }) });
		await refreshAll();
	};

	const startExamSim = async () => {
		if (!selectedExamId) return;
		let qs = questions;
		if (qs.length === 0) {
			await generateQuestions();
			const res = await fetch(`/api/exam-readiness/questions?examId=${selectedExamId}`, { cache: "no-store" });
			const data = await res.json();
			qs = data.questions ?? [];
			setQuestions(qs);
		}
		const ids = qs.map((q) => q.id);
		const res = await fetch("/api/exam-readiness/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: selectedExamId, mode: "exam-sim", timeLimitSec: (selectedExam?.durationMinutes ?? 60) * 60, questionIds: ids }) });
		const data = await res.json();
		if (data.session) {
			setActiveSession(data.session);
			setAnswers({});
		}
	};

	const submitSession = async (_auto = false) => {
		if (!activeSession || !selectedExamId) return;
		const qs = questions.filter((q) => activeSession.questionIds.includes(q.id));
		const attempts = qs.map((q) => {
			const ans = answers[q.id] ?? "";
			const correct = q.correctAnswer ? ans === q.correctAnswer : false;
			return {
				examId: selectedExamId,
				sessionId: activeSession.id,
				questionId: q.id,
				topic: q.topic,
				dimension: q.dimension,
				difficulty: q.difficulty,
				correct,
				score: correct ? 1 : 0,
				independent: true,
				hintUsed: false,
				timeSpentSec: 0,
			};
		});
		await fetch("/api/exam-readiness/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempts }) });
		await fetch(`/api/exam-readiness/sessions/${activeSession.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submit: true, answers }) });
		setActiveSession(null);
		setTimeLeft(null);
		await refreshAll();
	};

	const runAction = (href: string) => {
		window.location.href = href;
	};

	const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

	return (
		<div className="mx-auto max-w-7xl p-6 space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Examination Readiness</h1>
				<Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Cancel" : "New Exam"}</Button>
			</div>

			{showCreate && (
				<div className="rounded border p-4 space-y-3 max-w-2xl">
					<div className="font-medium">Create examination profile</div>
					<div className="grid grid-cols-2 gap-3">
						<Input placeholder="Exam name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
						<Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
						<Input placeholder="Coverage (comma-separated topics)" value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} className="col-span-2" />
						<Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
						<Input placeholder="Duration (min)" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
						<Input placeholder="Total questions" value={form.totalQuestions} onChange={(e) => setForm({ ...form, totalQuestions: e.target.value })} />
						<Input placeholder="Total points" value={form.totalPoints} onChange={(e) => setForm({ ...form, totalPoints: e.target.value })} />
						<Input placeholder="Target score" value={form.targetScore} onChange={(e) => setForm({ ...form, targetScore: e.target.value })} />
						<Input placeholder="Passing score" value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: e.target.value })} />
					</div>
					<Button onClick={createExam} disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
				</div>
			)}

			<div className="flex gap-2 flex-wrap">
				{exams.map((e) => (
					<Button key={e.id} variant={selectedExamId === e.id ? "default" : "outline"} onClick={() => setSelectedExamId(e.id)}>
						{e.name} — {e.subject}
					</Button>
				))}
			</div>

			{selectedExam && (
				<>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="rounded border p-4 space-y-2">
							<div className="text-xs text-muted-foreground">Overall readiness</div>
							<div className="text-4xl font-bold">{readiness?.overall ?? "—"}</div>
							<div className="text-sm">{readiness?.status ?? "insufficient-data"}</div>
							<div className="text-xs text-muted-foreground">{readiness?.confidenceReason}</div>
							<div className="text-xs">Confidence: {readiness?.confidence}</div>
							<div className="text-xs">Evidence: {readiness?.evidenceCount} attempts</div>
						</div>
						<div className="rounded border p-4 space-y-2">
							<div className="text-xs text-muted-foreground">Target / Estimated</div>
							<div className="text-sm">Target: {selectedExam.targetScore}%</div>
							<div className="text-sm">Passing: {selectedExam.passingScore}%</div>
							<div className="text-sm">Estimated: {prediction?.estimatedScore ?? "—"} {prediction?.estimatedRange ? `(${prediction.estimatedRange[0]}–${prediction.estimatedRange[1]})` : ""}</div>
							<div className="text-sm">P(pass): {prediction?.probPass ?? "—"}% · P(target): {prediction?.probTarget ?? "—"}%</div>
							<div className="text-xs text-muted-foreground">{prediction?.provisional ? "Provisional estimate (no historical exam outcomes)." : ""}</div>
						</div>
						<div className="rounded border p-4 space-y-2">
							<div className="text-xs text-muted-foreground">Exam</div>
							<div className="text-sm">{selectedExam.name}</div>
							<div className="text-sm">{new Date(selectedExam.examDate).toLocaleDateString()}</div>
							<div className="text-sm">Duration: {selectedExam.durationMinutes} min</div>
							<div className="flex gap-2 mt-2">
								<Button size="sm" onClick={generateQuestions}>Generate questions</Button>
								<Button size="sm" onClick={startExamSim}>Start exam sim</Button>
							</div>
						</div>
					</div>

					{readiness?.insufficientReason && (
						<div className="rounded border border-yellow-500/40 p-3 text-sm text-yellow-400">
							Insufficient data: {readiness.insufficientReason}
						</div>
					)}

					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Dimension scores</div>
						<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
							{readiness && Object.entries(readiness.dimensions).map(([k, v]) => (
								<div key={k} className="text-sm">
									<span className="capitalize">{k}</span>: {v.score ?? "—"}% <span className="text-xs text-muted-foreground">({v.evidenceCount})</span>
								</div>
							))}
						</div>
					</div>

					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Topic readiness</div>
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-muted-foreground">
									<th>Topic</th><th>Readiness</th><th>Status</th><th>Accuracy</th><th>Delayed recall</th><th>Evidence</th>
								</tr>
							</thead>
							<tbody>
								{(readiness?.topics ?? []).map((t) => (
									<tr key={t.topic} className="border-t">
										<td>{t.topic}</td>
										<td>{t.score ?? "—"}</td>
										<td>{t.status}</td>
										<td>{t.accuracy ?? "—"}%</td>
										<td>{t.delayedRecall ?? "—"}%</td>
										<td>{t.evidenceCount}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{prediction?.factors?.length ? (
						<div className="rounded border p-4 space-y-1">
							<div className="font-medium">Risk factors</div>
							{prediction.factors.map((f, i) => <div key={i} className="text-sm text-muted-foreground">• {f}</div>)}
						</div>
					) : null}

					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Study plan</div>
						{plan.length === 0 && <div className="text-xs text-muted-foreground">No recommendations yet.</div>}
						{plan.map((r) => (
							<div key={r.id} className="flex items-center justify-between border-b py-2">
								<div>
									<div className="text-sm font-medium">{r.title}</div>
									<div className="text-xs text-muted-foreground">{r.description}</div>
								</div>
								<Button size="sm" variant="outline" onClick={() => runAction(r.action.href)}>Go</Button>
							</div>
						))}
					</div>

					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Recent exam sessions</div>
						{sessions.length === 0 && <div className="text-xs text-muted-foreground">No sessions yet.</div>}
						{sessions.slice(0, 5).map((s) => (
							<div key={s.id} className="text-sm flex justify-between border-b py-1">
								<span>{s.mode} · {s.status}</span>
								<span className="text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</span>
							</div>
						))}
					</div>
				</>
			)}

			{activeSession && (
				<div className="fixed inset-0 bg-background/95 z-50 p-6 overflow-y-auto">
					<div className="max-w-3xl mx-auto space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-xl font-bold">Exam simulation</h2>
							<div className="text-sm">{timeLeft !== null ? fmtTime(timeLeft) : ""}</div>
						</div>
						{activeSession.questionIds.map((qid, idx) => {
							const q = questions.find((x) => x.id === qid);
							if (!q) return null;
							return (
								<div key={qid} className="rounded border p-3 space-y-2">
									<div className="text-sm font-medium">{idx + 1}. {q.prompt}</div>
									{q.options ? (
										<div className="space-y-1">
											{q.options.map((opt) => (
												<label key={opt} className="flex items-center gap-2 text-sm">
													<input type="radio" name={qid} checked={answers[qid] === opt} onChange={() => setAnswers((a) => ({ ...a, [qid]: opt }))} />
													{opt}
												</label>
											))}
										</div>
									) : (
										<Input placeholder="Your answer" value={answers[qid] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [qid]: e.target.value }))} />
									)}
								</div>
							);
						})}
						<div className="flex gap-2">
							<Button onClick={() => submitSession(false)}>Submit</Button>
							<Button variant="outline" onClick={() => { setActiveSession(null); setTimeLeft(null); }}>Cancel</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
