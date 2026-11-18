"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Choice { id: string; text?: string; svg?: string }
interface Q { id: string; domain: string; topic: string; difficulty: number; stem: string; choices: Choice[]; correct: string; explanation: string; estimatedTime: number }
interface Stats { totalQuestions: number; totalAttempts: number; byDomain: Record<string, { total: number; correct: number }>; examDate?: string }

const DOMAINS = ["reading", "spatial", "math", "science"] as const;

export default function DostPage() {
	const [tab, setTab] = useState<"overview" | "practice" | "mock" | "analytics">("overview");
	const [domain, setDomain] = useState<string>("spatial");
	const [questions, setQuestions] = useState<Q[]>([]);
	const [stats, setStats] = useState<Stats | null>(null);
	const [idx, setIdx] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	const [result, setResult] = useState<{ correct: boolean; explanation: string } | null>(null);
	const [hint, setHint] = useState<string>("");
	const [hintLevel, setHintLevel] = useState(1);
	const [examDate, setExamDate] = useState("");
	const [mockRunning, setMockRunning] = useState(false);
	const [mockTime, setMockTime] = useState(0);

	const refresh = useCallback(async () => {
		const [qRes, sRes] = await Promise.all([fetch(`/api/dost/questions?domain=${domain}`, { cache: "no-store" }), fetch("/api/dost/stats", { cache: "no-store" })]);
		const q = await qRes.json();
		const s = await sRes.json();
		setQuestions(q.questions ?? []);
		setStats(s.stats ?? null);
		if (s.stats?.examDate) setExamDate(s.stats.examDate);
		setIdx(0);
		setSelected(null);
		setResult(null);
	}, [domain]);

	useEffect(() => { void refresh(); }, [refresh]);

	const submit = async () => {
		if (!selected || !questions[idx]) return;
		const q = questions[idx]!;
		try {
			const res = await fetch("/api/dost/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, domain: q.domain, answer: selected, timeSpent: 0 }) });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error ?? "submit failed");
			setResult({ correct: !!data.correct, explanation: data.explanation ?? "" });
			await refresh();
		} catch (err) {
			setResult({ correct: false, explanation: err instanceof Error ? err.message : String(err) });
		}
	};

	const next = () => { setIdx((i) => Math.min(questions.length - 1, i + 1)); setSelected(null); setResult(null); setHint(""); setHintLevel(1); };

	const saveExamDate = async () => {
		await fetch("/api/dost/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examDate }) });
		await refresh();
	};

	const current = questions[idx];

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-4">
			<h1 className="text-2xl font-bold">DOST-JLSS Review Center</h1>
			<div className="flex gap-2 flex-wrap">
				{(["overview","practice","mock","analytics"] as const).map((t) => <Button key={t} variant={tab===t?"default":"outline"} onClick={() => setTab(t)}>{t}</Button>)}
			</div>

			{tab === "overview" && (
				<div className="space-y-4">
					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Examination date</div>
						<div className="flex gap-2">
							<Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
							<Button onClick={() => void saveExamDate()}>Save</Button>
						</div>
						{stats?.examDate && <div className="text-xs text-muted-foreground">Set: {new Date(stats.examDate).toDateString()}</div>}
					</div>
					<div className="rounded border p-4">
						<div className="font-medium mb-2">Domain performance</div>
						{DOMAINS.map((d) => {
							const s = stats?.byDomain?.[d] ?? { total: 0, correct: 0 };
							const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
							return <div key={d} className="flex justify-between text-sm py-1"><span className="capitalize">{d}</span><span>{s.correct}/{s.total} ({pct}%)</span></div>;
						})}
					</div>
					<div className="rounded border p-4 text-sm">
						<div>Total questions: {stats?.totalQuestions ?? 0}</div>
						<div>Total attempts: {stats?.totalAttempts ?? 0}</div>
					</div>
				</div>
			)}

			{tab === "practice" && (
				<div className="space-y-4">
					<div className="flex gap-2 flex-wrap">
						{DOMAINS.map((d) => <Button key={d} variant={domain===d?"default":"outline"} onClick={() => setDomain(d)}>{d}</Button>)}
					</div>
					{current && (
						<div className="rounded border p-4 space-y-3">
							<div className="text-xs text-muted-foreground">{current.topic} · difficulty {current.difficulty} · ~{current.estimatedTime}s</div>
							<div className="text-sm" dangerouslySetInnerHTML={{ __html: current.stem }} />
							<div className="grid grid-cols-2 gap-2">
								{current.choices.map((c) => (
									<button key={c.id} onClick={() => setSelected(c.id)} className={`rounded border p-2 text-left ${selected === c.id ? "bg-accent" : ""}`}>
										{c.svg ? <div dangerouslySetInnerHTML={{ __html: c.svg }} /> : <span>{c.id}. {c.text}</span>}
									</button>
								))}
							</div>
							{!result && (
								<div className="flex gap-2 items-center">
									<Button variant="outline" onClick={async () => {
										if (!current) return;
										setHint("Loading hint…");
										const res = await fetch("/api/dost/hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: current.id, level: hintLevel }) });
										const data = await res.json();
										setHint(data.hint ?? data.error ?? "");
										setHintLevel((l) => Math.min(4, l + 1));
									}}>Hint (level {hintLevel})</Button>
									{hint && <div className="text-sm text-muted-foreground">{hint}</div>}
								</div>
							)}
							{!result ? (
								<Button onClick={() => void submit()} disabled={!selected}>Submit</Button>
							) : (
								<div className="space-y-2">
									<div className={result.correct ? "text-green-500" : "text-red-500"}>{result.correct ? "Correct" : "Incorrect"}</div>
									<div className="text-sm">{result.explanation}</div>
									<Button onClick={next}>Next</Button>
								</div>
							)}
						</div>
					)}
					{!current && <div className="text-xs text-muted-foreground">No questions.</div>}
				</div>
			)}

			{tab === "mock" && (
				<div className="rounded border p-4 space-y-2">
					<div className="font-medium">Mock examination</div>
					<p className="text-sm text-muted-foreground">Start a timed run using all available questions (practice mode with explanations after).</p>
					{!mockRunning ? (
						<Button onClick={() => { setMockRunning(true); setMockTime(0); setIdx(0); setSelected(null); setResult(null); setQuestions([...questions]); }}>Start mock (all domains)</Button>
					) : (
						<Button onClick={() => setMockRunning(false)}>End mock</Button>
					)}
					{mockRunning && current && (
						<div className="space-y-3">
							<div className="text-xs text-muted-foreground">Q{idx + 1}/{questions.length}</div>
							<div className="text-sm" dangerouslySetInnerHTML={{ __html: current.stem }} />
							<div className="grid grid-cols-2 gap-2">
								{current.choices.map((c) => (
									<button key={c.id} onClick={() => setSelected(c.id)} className={`rounded border p-2 text-left ${selected === c.id ? "bg-accent" : ""}`}>
										{c.svg ? <div dangerouslySetInnerHTML={{ __html: c.svg }} /> : <span>{c.id}. {c.text}</span>}
									</button>
								))}
							</div>
							{!result ? <Button onClick={() => void submit()} disabled={!selected}>Submit</Button> : <><div className={result.correct ? "text-green-500" : "text-red-500"}>{result.correct ? "Correct" : "Incorrect"}</div><div className="text-sm">{result.explanation}</div><Button onClick={next}>Next</Button></>}
						</div>
					)}
				</div>
			)}

			{tab === "analytics" && stats && (
				<div className="rounded border p-4 space-y-2">
					<div className="font-medium">Analytics</div>
					{DOMAINS.map((d) => {
						const s = stats.byDomain?.[d] ?? { total: 0, correct: 0 };
						const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
						return <div key={d} className="flex justify-between text-sm py-1"><span className="capitalize">{d}</span><span>{s.correct}/{s.total} ({pct}%)</span></div>;
					})}
					<div className="text-sm">Total attempts: {stats.totalAttempts}</div>
					<div className="text-sm">Readiness (simple): {stats.totalAttempts ? Math.round((Object.values(stats.byDomain).reduce((a, b) => a + b.correct, 0) / Math.max(1, stats.totalAttempts)) * 100) : 0}%</div>
				</div>
			)}
		</div>
	);
}
