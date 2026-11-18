"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface AnimationScene { title: string; description: string; narration?: string; equation?: string; }
interface AnimationSpec { title: string; subject: string; topic: string; learningObjective: string; scenes: AnimationScene[]; keyTakeaways?: string[]; misconceptions?: string[]; knowledgeChecks?: string[]; }
interface Animation {
	id: string;
	owner: string;
	title: string;
	subject: string;
	topic: string;
	learningObjective: string;
	spec?: AnimationSpec;
	code: string;
	sceneName: string;
	status: "draft" | "queued" | "rendering" | "ready" | "failed" | "cancelled";
	quality: "preview" | "standard" | "high";
	renderJobId?: string;
	artifactPath?: string;
	createdAt: string;
	updatedAt: string;
	error?: string;
	metadata?: Record<string, unknown>;
}

const SUBJECTS = ["mathematics", "physics", "computer_science"];

export default function VisualLearningStudioPage() {
	const [animations, setAnimations] = useState<Animation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generating, setGenerating] = useState(false);
	const [rendering, setRendering] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState({
		topic: "",
		subject: "mathematics",
		learningObjective: "",
		difficulty: "intermediate",
		duration: 30,
		style: "step-by-step",
		equation: "",
	});
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [sceneIndex, setSceneIndex] = useState(0);

	const selected = useMemo(() => animations.find((a) => a.id === selectedId) ?? null, [animations, selectedId]);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/animations?owner=local", { cache: "no-store" });
			const j = await res.json();
			setAnimations(j.animations ?? []);
			if (!selectedId && (j.animations ?? []).length) setSelectedId(j.animations[0].id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [selectedId]);

	useEffect(() => { void refresh(); }, [refresh]);

	// poll status while rendering
	useEffect(() => {
		if (!selected || selected.status !== "rendering") return;
		const t = setInterval(async () => {
			const res = await fetch(`/api/animations/${selected.id}/status`, { cache: "no-store" });
			const j = await res.json();
			if (j.animation) {
				setAnimations((prev) => prev.map((a) => (a.id === selected.id ? j.animation : a)));
			}
		}, 2000);
		return () => clearInterval(t);
	}, [selected]);

	const generate = async () => {
		if (!form.topic.trim()) return;
		setGenerating(true);
		setError(null);
		try {
			const res = await fetch("/api/animations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ generate: true, owner: "local", ...form }),
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j.error || "generation failed");
			setAnimations((prev) => [j.animation, ...prev]);
			setSelectedId(j.animation.id);
			setShowForm(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setGenerating(false);
		}
	};

	const render = async (quality: string) => {
		if (!selected) return;
		setRendering(true);
		setError(null);
		try {
			const res = await fetch(`/api/animations/${selected.id}/render`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ quality }),
			});
			const j = await res.json();
			if (!res.ok) throw new Error(j.error || "render failed");
			setAnimations((prev) => prev.map((a) => (a.id === selected.id ? j.animation : a)));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setRendering(false);
		}
	};

	const saveTitle = async () => {
		if (!selected) return;
		await fetch(`/api/animations/${selected.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: titleDraft }),
		});
		setEditingTitle(false);
		void refresh();
	};

	const videoSrc = selected && selected.status === "ready" ? `/api/animations/${selected.id}/video?t=${selected.updatedAt}` : null;

	useEffect(() => {
		if (videoRef.current) videoRef.current.playbackRate = playbackRate;
	}, [playbackRate]);

	const scenes = selected?.spec?.scenes ?? [];

	return (
		<div className="flex h-screen w-full bg-background text-foreground">
			{/* Left sidebar */}
			<aside className="w-64 border-r flex flex-col">
				<div className="p-3 border-b">
					<h2 className="text-sm font-semibold">Visual Learning Studio</h2>
					<p className="text-xs text-muted-foreground">My animations</p>
				</div>
				<div className="p-2">
					<Button size="sm" className="w-full" onClick={() => setShowForm((v) => !v)}>
						{showForm ? "Close form" : "Generate animation"}
					</Button>
				</div>
				<div className="flex-1 overflow-auto p-2 space-y-1">
					{loading && <div className="text-xs text-muted-foreground">Loading…</div>}
					{animations.length === 0 && !loading && <div className="text-xs text-muted-foreground">No animations yet.</div>}
					{animations.map((a) => (
						<button
							key={a.id}
							onClick={() => setSelectedId(a.id)}
							className={`w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent ${selectedId === a.id ? "bg-accent" : ""}`}
						>
							<div className="font-medium truncate">{a.title}</div>
							<div className="text-muted-foreground truncate">{a.subject} · {a.status}</div>
						</button>
					))}
				</div>
			</aside>

			{/* Main canvas */}
			<main className="flex-1 flex flex-col">
				<div className="border-b p-2 flex items-center gap-2 flex-wrap">
					{selected && (
						<>
							{editingTitle ? (
								<>
									<Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="w-48 h-8" />
									<Button size="sm" onClick={() => void saveTitle()}>Save</Button>
									<Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>Cancel</Button>
								</>
							) : (
								<Button size="sm" variant="ghost" onClick={() => { setEditingTitle(true); setTitleDraft(selected.title); }}>
									{selected.title}
								</Button>
							)}
							<span className="text-xs text-muted-foreground">{selected.subject} · {selected.topic}</span>
							<div className="ml-auto flex gap-2">
								<Button size="sm" onClick={() => void render("preview")} disabled={rendering || selected.status === "rendering"}>Preview render</Button>
								<Button size="sm" variant="outline" onClick={() => void render("standard")} disabled={rendering || selected.status === "rendering"}>Standard</Button>
								<Button size="sm" variant="outline" onClick={() => void render("high")} disabled={rendering || selected.status === "rendering"}>High quality</Button>
							</div>
						</>
					)}
				</div>

				<div className="flex-1 flex items-center justify-center bg-black/5 p-4">
					{showForm ? (
						<div className="w-full max-w-2xl space-y-3 bg-card p-4 rounded border">
							<h3 className="font-semibold">Generate animation</h3>
							<Input placeholder="Topic or concept" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
							<select className="border rounded px-2 py-1 text-sm bg-background" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
								{SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
							</select>
							<Input placeholder="Learning objective (optional)" value={form.learningObjective} onChange={(e) => setForm({ ...form, learningObjective: e.target.value })} />
							<Input placeholder="Equation or problem (optional)" value={form.equation} onChange={(e) => setForm({ ...form, equation: e.target.value })} />
							<div className="flex gap-2">
								<Input type="number" min={10} max={120} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className="w-24" />
								<select className="border rounded px-2 py-1 text-sm bg-background" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
									<option value="beginner">beginner</option>
									<option value="intermediate">intermediate</option>
									<option value="advanced">advanced</option>
								</select>
								<select className="border rounded px-2 py-1 text-sm bg-background" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
									<option value="step-by-step">step-by-step</option>
									<option value="intuitive">intuitive</option>
									<option value="formal">formal</option>
								</select>
							</div>
							<div className="flex gap-2">
								<Button onClick={() => void generate()} disabled={generating || !form.topic.trim()}>
									{generating ? "Generating…" : "Generate"}
								</Button>
								<Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
							</div>
							{error && <div className="text-sm text-red-500">{error}</div>}
						</div>
					) : selected ? (
						<div className="w-full h-full flex flex-col items-center justify-center gap-3">
							{selected.status === "rendering" && (
								<div className="text-sm">Rendering… (this may take a while)</div>
							)}
							{selected.status === "failed" && (
								<div className="text-sm text-red-500">Render failed: {selected.error}</div>
							)}
							{videoSrc ? (
								<video
									ref={videoRef}
									src={videoSrc}
									controls
									className="max-h-[70vh] max-w-full rounded shadow"
								/>
							) : (
								<div className="text-sm text-muted-foreground">
									{selected.status === "ready" ? "Video unavailable" : "No render yet. Click “Preview render”."}
								</div>
							)}
							{/* custom controls */}
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={() => videoRef.current?.play()}>Play</Button>
								<Button size="sm" variant="outline" onClick={() => videoRef.current?.pause()}>Pause</Button>
								<Button size="sm" variant="outline" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); } }}>Replay</Button>
								<select className="border rounded px-2 py-1 text-xs bg-background" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))}>
									{[0.5, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}
								</select>
								<Button size="sm" variant="outline" onClick={() => videoRef.current?.requestFullscreen?.()}>Fullscreen</Button>
							</div>
							{scenes.length > 0 && (
								<div className="flex gap-2 flex-wrap justify-center">
									{scenes.map((s, i) => (
										<Button key={i} size="sm" variant={sceneIndex === i ? "default" : "outline"} onClick={() => setSceneIndex(i)}>
											Scene {i + 1}
										</Button>
									))}
								</div>
							)}
						</div>
					) : (
						<div className="text-sm text-muted-foreground">Select or generate an animation.</div>
					)}
				</div>
			</main>

			{/* Right inspector */}
			<aside className="w-80 border-l overflow-auto p-3 space-y-3 text-sm">
				{selected ? (
					<>
						<section>
							<h3 className="font-semibold">Overview</h3>
							<p className="text-xs text-muted-foreground">{selected.learningObjective}</p>
							<p className="text-xs mt-1">Status: {selected.status} · Quality: {selected.quality}</p>
						</section>
						{selected.spec?.keyTakeaways && selected.spec.keyTakeaways.length > 0 && (
							<section>
								<h3 className="font-semibold">Key takeaways</h3>
								<ul className="list-disc pl-4 text-xs">{selected.spec.keyTakeaways.map((k, i) => <li key={i}>{k}</li>)}</ul>
							</section>
						)}
						{selected.spec?.misconceptions && selected.spec.misconceptions.length > 0 && (
							<section>
								<h3 className="font-semibold">Misconceptions</h3>
								<ul className="list-disc pl-4 text-xs">{selected.spec.misconceptions.map((k, i) => <li key={i}>{k}</li>)}</ul>
							</section>
						)}
						{selected.spec?.knowledgeChecks && selected.spec.knowledgeChecks.length > 0 && (
							<section>
								<h3 className="font-semibold">Knowledge checks</h3>
								<ul className="list-disc pl-4 text-xs">{selected.spec.knowledgeChecks.map((k, i) => <li key={i}>{k}</li>)}</ul>
							</section>
						)}
						{scenes.length > 0 && (
							<section>
								<h3 className="font-semibold">Scene {sceneIndex + 1}</h3>
								<p className="text-xs font-medium">{scenes[sceneIndex]?.title}</p>
								<p className="text-xs text-muted-foreground">{scenes[sceneIndex]?.description}</p>
								{scenes[sceneIndex]?.equation && <p className="text-xs mt-1 font-mono">{scenes[sceneIndex].equation}</p>}
								{scenes[sceneIndex]?.narration && <p className="text-xs mt-1 italic">{scenes[sceneIndex].narration}</p>}
							</section>
						)}
						{typeof selected.metadata?.explanation === "string" && (
							<section>
								<h3 className="font-semibold">Explanation</h3>
								<p className="text-xs whitespace-pre-wrap">{selected.metadata.explanation as string}</p>
							</section>
						)}
						<section>
							<h3 className="font-semibold">Manim code</h3>
							<pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-64">{selected.code}</pre>
						</section>
					</>
				) : (
					<div className="text-xs text-muted-foreground">No animation selected.</div>
				)}
			</aside>
		</div>
	);
}
