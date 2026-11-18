"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Skill { id: string; name: string; domain: string; }
interface Mastery { skillId: string; score: number; state: string; confidence: string; evidenceCount: number; }
interface Stats { totalSkills: number; counts: Record<string, number>; totalEvidence: number; totalMisconceptions: number }

export default function LearningPage() {
	const [tab, setTab] = useState<"tree" | "mastery" | "diagnostics" | "analytics">("tree");
	const [skills, setSkills] = useState<Skill[]>([]);
	const [mastery, setMastery] = useState<Mastery[]>([]);
	const [relations, setRelations] = useState<any[]>([]);
	const [stats, setStats] = useState<Stats | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [evidenceSkill, setEvidenceSkill] = useState("");
	const [correct, setCorrect] = useState(true);

	const refresh = useCallback(async () => {
		await fetch("/api/learning/stats");
		const [sRes, mRes, rRes] = await Promise.all([fetch("/api/learning/skills", { cache: "no-store" }), fetch("/api/learning/stats", { cache: "no-store" }), fetch("/api/learning/relations", { cache: "no-store" })]);
		const s = await sRes.json();
		const m = await mRes.json();
		setSkills(s.skills ?? []);
		setMastery(m.mastery ?? []);
		const r = await rRes.json();
		setRelations(r.relations ?? []);
		setStats(m.stats ?? null);
	}, []);

	useEffect(() => { void refresh(); }, [refresh]);

	const addEvidence = async () => {
		if (!evidenceSkill) return;
		await fetch("/api/learning/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skillId: evidenceSkill, correct, independent: true, sourceType: "practice" }) });
		setEvidenceSkill("");
		await refresh();
	};

	const bySkill = (id: string) => mastery.find((m) => m.skillId === id);

	return (
		<div className="mx-auto max-w-7xl p-6 space-y-4">
			<h1 className="text-2xl font-bold">Learning & Mastery</h1>
			<div className="flex gap-2">
				{(["tree","mastery","diagnostics","analytics"] as const).map((t) => (
					<Button key={t} variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>{t}</Button>
				))}
			</div>

			{tab === "tree" && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="md:col-span-2 rounded border p-4 space-y-2 max-h-[70vh] overflow-y-auto">
						{Array.from(new Set(skills.map((s) => s.domain))).map((domain) => {
							const domainSkills = skills.filter((s) => s.domain === domain);
							const open = expanded[domain] ?? true;
							return (
								<div key={domain} className="space-y-1">
									<button className="w-full text-left font-medium text-sm py-1" onClick={() => setExpanded((e) => ({ ...e, [domain]: !open }))}>
										{open ? "▾" : "▸"} {domain} ({domainSkills.length})
									</button>
									{open && domainSkills.map((s) => {
										const m = bySkill(s.id);
										const state = m?.state ?? "unfamiliar";
										const color = state === "mastered" ? "text-green-500" : state === "proficient" ? "text-emerald-400" : state === "developing" ? "text-yellow-400" : state === "learning" ? "text-orange-400" : "text-muted-foreground";
										return (
											<button key={s.id} onClick={() => setSelected(s.id)} className={`w-full text-left rounded border p-2 ml-3 ${selected === s.id ? "bg-accent" : ""}`}>
												<div className="flex justify-between">
													<span className="font-medium">{s.name}</span>
													<span className={`text-xs ${color}`}>{state}</span>
												</div>
												<div className="text-xs text-muted-foreground">evidence {m?.evidenceCount ?? 0} · score {((m?.score ?? 0) * 100).toFixed(0)}%</div>
											</button>
										);
									})}
								</div>
							);
						})}
						{skills.length === 0 && <div className="text-xs text-muted-foreground">No skills. Seeding…</div>}
					</div>
					<div className="rounded border p-4 space-y-2">
						<div className="font-medium">Skill detail</div>
						{selected ? (
							<>
								<div>{skills.find((s) => s.id === selected)?.name}</div>
								<div className="text-xs text-muted-foreground">{skills.find((s) => s.id === selected)?.domain}</div>
								<div className="text-xs">State: {bySkill(selected)?.state ?? "unfamiliar"}</div>
								<div className="text-xs">Score: {((bySkill(selected)?.score ?? 0) * 100).toFixed(0)}%</div>
								<div className="text-xs">Confidence: {bySkill(selected)?.confidence ?? "low"}</div>
								<div className="text-xs mt-2">Prerequisites: {relations.filter((r) => r.to === selected).map((r) => skills.find((s) => s.id === r.from)?.name).join(", ") || "none"}</div>
								<div className="text-xs">Dependents: {relations.filter((r) => r.from === selected).map((r) => skills.find((s) => s.id === r.to)?.name).join(", ") || "none"}</div>
							</>
						) : <div className="text-xs text-muted-foreground">Select a skill.</div>}
					</div>
				</div>
			)}

			{tab === "mastery" && (
				<div className="rounded border p-4 space-y-2">
					{mastery.length === 0 && <div className="text-xs text-muted-foreground">No mastery records yet. Record evidence to build mastery.</div>}
					{mastery.map((m) => (
						<div key={m.skillId} className="flex justify-between text-sm border-b py-1">
							<span>{skills.find((s) => s.id === m.skillId)?.name ?? m.skillId}</span>
							<span>{m.state} · {Math.round(m.score * 100)}% · {m.confidence} · ev {m.evidenceCount}</span>
						</div>
					))}
				</div>
			)}

			{tab === "diagnostics" && (
				<div className="rounded border p-4 space-y-2 max-w-md">
					<div className="font-medium">Record learning evidence</div>
					<select className="border rounded p-2 w-full" value={evidenceSkill} onChange={(e) => setEvidenceSkill(e.target.value)}>
						<option value="">Select skill</option>
						{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
					</select>
					<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={correct} onChange={(e) => setCorrect(e.target.checked)} /> Correct</label>
					<Button onClick={() => void addEvidence()}>Record</Button>
				</div>
			)}

			{tab === "analytics" && stats && (
				<div className="rounded border p-4 space-y-2">
					<div>Total skills: {stats.totalSkills}</div>
					<div>Total evidence: {stats.totalEvidence}</div>
					<div>Misconceptions: {stats.totalMisconceptions}</div>
					<div className="flex gap-4 text-sm">
						{Object.entries(stats.counts).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
					</div>
				</div>
			)}
		</div>
	);
}
