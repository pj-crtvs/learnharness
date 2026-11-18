"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KNode { id: string; name: string; type: string; subject?: string; description?: string; }
interface KEdge { id: string; source: string; target: string; type: string; }
interface Mastery { conceptId: string; state: string; score: number; confidence: string; }

const STATE_COLOR: Record<string, string> = {
	not_introduced: "#9ca3af",
	introduced: "#60a5fa",
	developing: "#fbbf24",
	needs_reinforcement: "#f97316",
	inconsistent: "#ef4444",
	proficient: "#34d399",
	strong_mastery: "#10b981",
	insufficient_evidence: "#a78bfa",
};

export default function KnowledgeGraphPage() {
	const [nodes, setNodes] = useState<KNode[]>([]);
	const [edges, setEdges] = useState<KEdge[]>([]);
	const [mastery, setMastery] = useState<Mastery[]>([]);
	const [studentId, setStudentId] = useState("demo-student");
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState("");
	const [selected, setSelected] = useState<KNode | null>(null);
	const [target, setTarget] = useState("");
	const [pathway, setPathway] = useState<string[]>([]);

	const refresh = useCallback(async () => {
		const [nRes, eRes, mRes] = await Promise.all([
			fetch("/api/knowledge-graph/nodes", { cache: "no-store" }),
			fetch("/api/knowledge-graph/edges", { cache: "no-store" }),
			fetch(`/api/knowledge-graph/mastery?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" }),
		]);
		const n = await nRes.json();
		const e = await eRes.json();
		const m = await mRes.json();
		setNodes(n.nodes ?? []);
		setEdges(e.edges ?? []);
		setMastery(m.mastery ?? []);
	}, [studentId]);

	useEffect(() => { void refresh(); }, [refresh]);

	const masteryByConcept = useMemo(() => {
		const map: Record<string, Mastery> = {};
		for (const m of mastery) map[m.conceptId] = m;
		return map;
	}, [mastery]);

	const filteredNodes = useMemo(() => {
		return nodes.filter((n) => {
			if (search && !n.name.toLowerCase().includes(search.toLowerCase())) return false;
			if (typeFilter && n.type !== typeFilter) return false;
			return true;
		});
	}, [nodes, search, typeFilter]);

	const rfNodes: Node[] = useMemo(() => {
		return filteredNodes.map((n, i) => {
			const m = masteryByConcept[n.id];
			const state = m?.state ?? "not_introduced";
			return {
				id: n.id,
				data: { label: n.name },
				position: { x: (i % 8) * 180, y: Math.floor(i / 8) * 100 },
				style: { background: STATE_COLOR[state] ?? "#ccc", color: "#fff", borderRadius: 8, padding: 6, fontSize: 11 },
			};
		});
	}, [filteredNodes, masteryByConcept]);

	const rfEdges: Edge[] = useMemo(() => {
		const ids = new Set(filteredNodes.map((n) => n.id));
		return edges
			.filter((e) => ids.has(e.source) && ids.has(e.target))
			.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.type }));
	}, [edges, filteredNodes]);

	const loadPathway = async () => {
		if (!target) return;
		const res = await fetch(`/api/knowledge-graph/traverse?conceptId=${encodeURIComponent(target)}`);
		const data = await res.json();
		setPathway(data.transitivePrerequisites ?? []);
	};

	const weakOnly = () => {
		const weakIds = new Set(mastery.filter((m) => m.state === "developing" || m.state === "needs_reinforcement" || m.state === "inconsistent").map((m) => m.conceptId));
		// filter view by setting search? Instead, alert count
		alert(`Weak concepts: ${weakIds.size}`);
	};

	const nodeTypes = Array.from(new Set(nodes.map((n) => n.type)));

	return (
		<div className="mx-auto max-w-7xl p-4 space-y-3">
			<h1 className="text-2xl font-bold">Knowledge Graph & Prerequisite Intelligence</h1>
			<div className="flex flex-wrap gap-2 items-center">
				<Input placeholder="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-40" />
				<Input placeholder="Search concepts" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
				<select className="border rounded p-2" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
					<option value="">All types</option>
					{nodeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
				</select>
				<Button onClick={() => void refresh()}>Refresh</Button>
				<Button variant="outline" onClick={weakOnly}>Show weak count</Button>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div className="lg:col-span-2 rounded border h-[60vh]">
					<ReactFlow nodes={rfNodes} edges={rfEdges} onNodeClick={(_, n) => setSelected(nodes.find((x) => x.id === n.id) ?? null)} fitView>
						<Background />
						<Controls />
						<MiniMap />
					</ReactFlow>
				</div>
				<div className="rounded border p-4 space-y-3 overflow-y-auto max-h-[60vh]">
					<div className="font-medium">Concept detail</div>
					{selected ? (
						<>
							<div className="font-semibold">{selected.name}</div>
							<div className="text-xs text-muted-foreground">{selected.type}</div>
							<div className="text-xs">{selected.description}</div>
							<div className="text-xs mt-2">Mastery: {masteryByConcept[selected.id]?.state ?? "not_introduced"} ({Math.round((masteryByConcept[selected.id]?.score ?? 0) * 100)}%)</div>
							<div className="flex flex-wrap gap-1 mt-2">
								<Button size="sm" onClick={() => window.location.href = `/chat/new`}>Learn this concept</Button>
							</div>
						</>
					) : <div className="text-xs text-muted-foreground">Select a node.</div>}

					<div className="border-t pt-3 space-y-2">
						<div className="font-medium text-sm">Learning pathway</div>
						<Input placeholder="Target concept id" value={target} onChange={(e) => setTarget(e.target.value)} />
						<Button size="sm" onClick={() => void loadPathway()}>Show pathway</Button>
						<ul className="text-xs space-y-1">
							{pathway.map((p) => <li key={p}>{p}</li>)}
						</ul>
					</div>
				</div>
			</div>

			<div className="text-xs text-muted-foreground">
				Nodes: {nodes.length} · Edges: {edges.length} · Mastery records: {mastery.length}
			</div>
		</div>
	);
}