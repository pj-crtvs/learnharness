"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Deck { id: string; name: string; source?: { kind: string; name: string }; createdAt: string; updatedAt: string; }
interface Card { id: string; deckId: string; front: string; back: string; kind: string; state: "new"|"learning"|"review"|"relearning"; scheduling: { due: string; stability: number; difficulty: number; reps: number; lapses: number; lastReview?: string; step?: number }; sourceRef?: { document: string; page?: number } }
interface Stats { totalCards: number; totalDecks: number; counts: { new: number; learning: number; review: number; relearning: number }; dueToday: number; overdue: number; totalReviews: number }

export default function FlashcardsPage() {
	const [decks, setDecks] = useState<Deck[]>([]);
	const [cards, setCards] = useState<Card[]>([]);
	const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
	const [stats, setStats] = useState<Stats | null>(null);
	const [newDeckName, setNewDeckName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [status, setStatus] = useState<string>("");
	const [studyQueue, setStudyQueue] = useState<Card[]>([]);
	const [studyIndex, setStudyIndex] = useState(0);
	const [revealed, setRevealed] = useState(false);
	const [explanation, setExplanation] = useState("");
	const [confidence, setConfidence] = useState(3);
	const [evalResult, setEvalResult] = useState<any>(null);
	const [evalLoading, setEvalLoading] = useState(false);

	const refresh = useCallback(async () => {
		const [dRes, cRes, sRes] = await Promise.all([
			fetch("/api/flashcards/decks", { cache: "no-store" }),
			fetch("/api/flashcards/cards", { cache: "no-store" }),
			fetch("/api/flashcards/stats", { cache: "no-store" }),
		]);
		const d = await dRes.json();
		const c = await cRes.json();
		const s = await sRes.json();
		setDecks(d.decks ?? []);
		setCards(c.cards ?? []);
		setStats(s.stats ?? null);
	}, []);

	useEffect(() => { void refresh(); }, [refresh]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (!studyQueue.length) return;
			if (e.code === "Space") { e.preventDefault(); if (!revealed) setRevealed(true); }
			if (revealed) {
				if (e.key === "1") void rate("again");
				if (e.key === "2") void rate("hard");
				if (e.key === "3") void rate("good");
				if (e.key === "4") void rate("easy");
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [studyQueue, revealed]);

	const deckCards = useMemo(() => selectedDeck ? cards.filter((c) => c.deckId === selectedDeck) : cards, [cards, selectedDeck]);

	const createDeck = async () => {
		if (!newDeckName.trim()) return;
		await fetch("/api/flashcards/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newDeckName }) });
		setNewDeckName("");
		await refresh();
	};

	const deleteDeck = async (id: string) => {
		if (!confirm("Delete this deck and all its cards?")) return;
		await fetch(`/api/flashcards/decks/${id}`, { method: "DELETE" });
		if (selectedDeck === id) setSelectedDeck(null);
		await refresh();
	};

	const handleUpload = async (file: File) => {
		setUploading(true);
		setStatus("Uploading PDF…");
		try {
			const form = new FormData();
			form.append("file", file);
			const upRes = await fetch("/api/flashcards/upload", { method: "POST", body: form });
			if (!upRes.ok) throw new Error(await upRes.text());
			const up = await upRes.json();
			setStatus("Generating flashcards…");
			setGenerating(true);
			const genRes = await fetch("/api/flashcards/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: up.document.name, text: up.text, count: 12 }),
			});
			if (!genRes.ok) throw new Error(await genRes.text());
			const gen = await genRes.json();
			setStatus(`Generated ${gen.cards?.length ?? 0} cards.`);
			setSelectedDeck(gen.deckId);
			await refresh();
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err));
		} finally {
			setUploading(false);
			setGenerating(false);
		}
	};

	const startStudy = (deckId: string) => {
		const now = new Date();
		const due = cards.filter((c) => c.deckId === deckId && new Date(c.scheduling.due) <= now);
		const queue = due.length ? due : cards.filter((c) => c.deckId === deckId).slice(0, 20);
		setStudyQueue(queue);
		setStudyIndex(0);
		setRevealed(false);
	};

	const rate = async (rating: "again"|"hard"|"good"|"easy") => {
		const card = studyQueue[studyIndex];
		if (!card) return;
		await fetch("/api/flashcards/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, rating }) });
		setRevealed(false);
		setExplanation("");
		setEvalResult(null);
		if (studyIndex + 1 < studyQueue.length) setStudyIndex(studyIndex + 1);
		else { setStudyQueue([]); setStudyIndex(0); await refresh(); }
	};

	const current = studyQueue[studyIndex];

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<h1 className="text-2xl font-bold">Flashcards</h1>
			<p className="text-sm text-muted-foreground">Upload PDFs, generate cards, and study with spaced repetition.</p>

			{/* Upload */}
			<div
				className="rounded-lg border border-dashed p-6 text-center space-y-2"
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleUpload(f); }}
			>
				<div className="font-medium">Upload PDF</div>
				<div className="text-xs text-muted-foreground">Drag & drop a PDF here, or choose a file.</div>
				<input type="file" accept="application/pdf" disabled={uploading || generating} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />
				{status && <div className="text-xs text-muted-foreground">{status}</div>}
			</div>

			{/* Create deck manually */}
			<div className="rounded-lg border p-4 space-y-2">
				<div className="font-medium">New deck</div>
				<div className="flex gap-2">
					<Input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="Deck name" />
					<Button onClick={() => void createDeck()}>Create</Button>
				</div>
			</div>

			{/* Dashboard */}
			{stats && (
				<div className="rounded-lg border p-4 space-y-3">
					<div className="font-medium">Spaced repetition</div>
					<div className="flex gap-4 text-sm">
						<span>New: {stats.counts.new}</span>
						<span>Learning: {stats.counts.learning}</span>
						<span>Review: {stats.counts.review}</span>
						<span>Relearning: {stats.counts.relearning}</span>
					</div>
					<div className="flex gap-4 text-sm">
						<span>Due today: {stats.dueToday}</span>
						<span>Overdue: {stats.overdue}</span>
						<span>Total reviews: {stats.totalReviews}</span>
						<span>Total cards: {stats.totalCards}</span>
					</div>
					<div className="h-3 w-full rounded bg-muted overflow-hidden flex">
						{(["new","learning","review","relearning"] as const).map((k) => {
							const total = stats.totalCards || 1;
							const pct = (stats.counts[k] / total) * 100;
							const color = k === "new" ? "bg-blue-500" : k === "learning" ? "bg-yellow-500" : k === "review" ? "bg-green-500" : "bg-red-500";
							return <div key={k} className={color} style={{ width: `${pct}%` }} />;
						})}
					</div>
				</div>
			)}

			{/* Decks */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="rounded-lg border p-4 space-y-2">
					<div className="font-medium">Decks</div>
					{decks.length === 0 && (
						<div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
							No decks yet. Upload a PDF or create a deck to start studying.
						</div>
					)}
					{decks.map((d) => {
						const dc = cards.filter((c) => c.deckId === d.id);
						const due = dc.filter((c) => new Date(c.scheduling.due) <= new Date()).length;
						return (
							<div key={d.id} className={`rounded border p-2 space-y-1 ${selectedDeck === d.id ? "bg-accent" : ""}`}>
								<div className="flex justify-between items-center">
									<button className="text-left font-medium" onClick={() => setSelectedDeck(d.id)}>{d.name}</button>
									<div className="flex gap-1">
										<Button size="sm" variant="outline" onClick={() => startStudy(d.id)}>Study ({due})</Button>
										<Button size="sm" variant="destructive" onClick={() => void deleteDeck(d.id)}>Delete</Button>
									</div>
								</div>
								<div className="text-xs text-muted-foreground">{dc.length} cards · {due} due · {d.source?.name ?? "manual"}</div>
							</div>
						);
					})}
				</div>
				<div className="rounded-lg border p-4 space-y-2">
					<div className="font-medium">Cards {selectedDeck ? "(selected deck)" : "(all)"}</div>
					<div className="max-h-96 overflow-y-auto space-y-2">
						{deckCards.map((c) => (
							<div key={c.id} className="rounded border p-2 text-sm">
								<div className="font-medium">{c.front}</div>
								<div className="text-xs text-muted-foreground">{c.back}</div>
								<div className="text-xs text-muted-foreground">{c.state} · due {new Date(c.scheduling.due).toLocaleString()} {c.sourceRef?.page ? `· p.${c.sourceRef.page}` : ""}</div>
							</div>
						))}
						{deckCards.length === 0 && <div className="text-xs text-muted-foreground">No cards.</div>}
					</div>
				</div>
			</div>

			{/* Study modal */}
			{current && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
					<div className="bg-background rounded-lg border p-6 max-w-xl w-full space-y-4">
						<div className="text-xs text-muted-foreground">Card {studyIndex + 1} / {studyQueue.length}</div>
						<div className="text-lg font-medium">{current.front}</div>
						{revealed && <div className="rounded border p-3 bg-accent/40">{current.back}</div>}
						{!revealed ? (
							<Button onClick={() => setRevealed(true)}>Reveal answer</Button>
						) : (
							<div className="flex gap-2">
								<Button variant="destructive" onClick={() => void rate("again")}>Again</Button>
								<Button variant="outline" onClick={() => void rate("hard")}>Hard</Button>
								<Button onClick={() => void rate("good")}>Good</Button>
								<Button variant="secondary" onClick={() => void rate("easy")}>Easy</Button>
							</div>
						)}
						{revealed && (
							<div className="space-y-2 border-t pt-3">
								<div className="text-xs font-medium">Explain & Evaluate</div>
								<textarea className="w-full border rounded p-2 text-sm" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explain in your own words…" />
								<div className="flex items-center gap-2 text-xs">
									<span>Confidence:</span>
									<input type="range" min={1} max={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
									<span>{confidence}</span>
								</div>
								<Button disabled={evalLoading || !explanation.trim()} onClick={async () => {
									if (!current) return;
									setEvalLoading(true);
									const res = await fetch("/api/explain/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: current.front, userExplanation: explanation, confidence, reference: current.back, cardId: current.id }) });
									const data = await res.json();
									setEvalResult(data.evaluation ?? data);
									setEvalLoading(false);
								}}>{evalLoading ? "Evaluating…" : "Evaluate"}</Button>
								{evalResult && (
									<div className="space-y-2 text-sm">
										<div>Overall: {evalResult.overall}% (confidence {confidence}/5)</div>
										<div className="grid grid-cols-2 gap-2 text-xs">
											<div>Conceptual {evalResult.conceptual}%</div>
											<div>Completeness {evalResult.completeness}%</div>
											<div>Reasoning {evalResult.reasoning}%</div>
											<div>Technical {evalResult.technical}%</div>
										</div>
										{evalResult.strengths?.length > 0 && <div><b>What you got right:</b> {evalResult.strengths.join("; ")}</div>}
										{evalResult.improvements?.length > 0 && <div><b>How to improve:</b> {evalResult.improvements.join("; ")}</div>}
										{evalResult.misconceptions?.length > 0 && <div className="text-red-400"><b>Misconceptions:</b> {evalResult.misconceptions.join("; ")}</div>}
										{evalResult.suggested && (
											<div className="border rounded p-2">
												<div className="text-xs font-medium mb-1">Side-by-side</div>
												<div className="grid grid-cols-2 gap-2 text-xs">
													<div><b>Your answer:</b> {explanation}</div>
													<div><b>Improved:</b> {evalResult.suggested}</div>
												</div>
											</div>
										)}
										{evalResult.followUp && <div className="text-xs"><b>Follow-up:</b> {evalResult.followUp}</div>}
									</div>
								)}
							</div>
						)}
						<Button variant="ghost" onClick={() => { setStudyQueue([]); setStudyIndex(0); }}>Quit</Button>
					</div>
				</div>
			)}
		</div>
	);
}
