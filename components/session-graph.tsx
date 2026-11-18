"use client";

/**
 * The session's learning map (owner, 2026-10-31): the WHOLE knowledge graph
 * docked beside the composer, so the learner can always see where the current
 * lesson sits in everything they have built. It is the same graph the home
 * view draws — same renderer, same layout ledger, same theme — at pane size:
 * fit on open, pan/zoom, click a node for its statement. Nodes this session
 * contributed (nodeSessions provenance) carry a steady halo; everything else
 * stays in the map, unhighlighted. Read-only except for drag-settling, which
 * persists positions exactly like the full view (the ledger is shared).
 *
 * Refresh rides the push channel, never a poll: `activity-changed` means an
 * extraction run moved (its merge may have landed), `lh:graph-revision` is
 * the deletion announcement, and `useServerResync` heals a reconnect.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	DEFAULT_RENDER_SETTINGS,
	incrementalLayout,
	sanitizeRenderSettings,
	type GraphNode,
	type GraphRenderSettings,
	type GraphSnapshot,
	type Position,
} from "@/src/core";
import { seedMissingNodePositions } from "@/components/graph-view";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { GraphCanvasRenderer } from "@/components/graph-canvas";
import Link from "next/link";

const NODE_COLOR_TOKEN = "--primary";

/** Resolve a CSS variable (oklch in this app) to #rrggbb via the canvas. */
function cssColorToHex(css: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "#888888";
	ctx.fillStyle = css;
	ctx.fillRect(0, 0, 1, 1);
	const { data } = ctx.getImageData(0, 0, 1, 1);
	return `#${[data[0]!, data[1]!, data[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function tokenHex(cssVar: string): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
	return value ? cssColorToHex(value) : "#888888";
}

export function SessionGraph({ chatId }: { chatId: string }) {
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
	const [selected, setSelected] = useState<{ node: GraphNode; anchor: { x: number; y: number } } | null>(null);
	const [settings, setSettings] = useState<GraphRenderSettings>(DEFAULT_RENDER_SETTINGS);
	const [refreshTick, setRefreshTick] = useState(0);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rendererRef = useRef<GraphCanvasRenderer | null>(null);
	const posRef = useRef<Map<string, Position> | null>(null);
	const snapshotRef = useRef<GraphSnapshot | null>(null);
	snapshotRef.current = snapshot;

	// ── truth: the derived graph + the shared render settings ──────────────
	useEffect(() => {
		let cancelled = false;
		fetch("/api/graph")
			.then((res) => (res.ok ? (res.json() as Promise<GraphSnapshot>) : null))
			.then((data) => {
				if (!cancelled && data) setSnapshot(data);
			})
			.catch((err) => console.error("[session-graph] fetch failed:", err));
		return () => {
			cancelled = true;
		};
	}, [refreshTick]);

	// The shared rendering settings (home view owns the controls; the pane
	// reads them once per mount so both surfaces draw the same graph).
	useEffect(() => {
		fetch("/api/graph/render-settings")
			.then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
			.then((raw) => {
				if (raw !== null) setSettings(sanitizeRenderSettings(raw));
			})
			.catch(() => {});
	}, []);

	// Push refresh: a run phase moved (its merge may be done) or a deletion
	// announced itself. Debounced — extraction emits several transitions.
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
	useServerEvent("activity-changed", () => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = undefined;
			refresh();
		}, 600);
	});
	useServerResync(refresh);
	useEffect(() => {
		const onRevision = () => refresh();
		window.addEventListener("lh:graph-revision", onRevision);
		return () => {
			window.removeEventListener("lh:graph-revision", onRevision);
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [refresh]);

	const isEmpty = snapshot === null || snapshot.nodes.length === 0;

	// ── layout: the shared positions ledger, with the same deterministic
	//    fallback as the home view (a fresh graph with no ledger yet) ───────
	useEffect(() => {
		if (!snapshot || snapshot.nodes.length === 0) return;
		const ledger = snapshot.positions;
		if (ledger) {
			const positions = new Map<string, Position>();
			for (const node of snapshot.nodes) {
				const p = ledger[node.id];
				if (p) positions.set(node.id, { x: p.x, y: p.y });
			}
			if (positions.size > 0) {
				posRef.current = seedMissingNodePositions(snapshot.nodes, positions);
				return () => {
					posRef.current = null;
				};
			}
		}
		posRef.current = incrementalLayout(snapshot.nodes, snapshot.edges, new Map());
		return () => {
			posRef.current = null;
		};
	}, [snapshot]);

	// ── the renderer (constructed once per non-empty lifetime; setData and
	//    settings feed it afterwards — its camera survives both) ────────────
	useEffect(() => {
		if (isEmpty) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const renderer = new GraphCanvasRenderer(canvas, {
			onSelect: (nodeId, pos) => {
				const node = snapshotRef.current?.nodes.find((n) => n.id === nodeId);
				if (node) setSelected({ node, anchor: pos });
			},
			onStageClick: () => setSelected(null),
			onContext: () => {},
			onCameraMove: () => setSelected(null),
			// A dragged node settles back into the SAME ledger the home view
			// reads — one layout truth, never a pane-local copy.
			onCommit: (positions) => {
				void fetch("/api/graph/positions", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(positions),
				}).catch((err) => console.error("[session-graph] positions commit failed:", err));
			},
		});
		rendererRef.current = renderer;
		return () => {
			rendererRef.current = null;
			renderer.destroy();
		};
	}, [isEmpty]);

	// Feed #1 — data. Runs after the layout effect in the same commit.
	useEffect(() => {
		const renderer = rendererRef.current;
		const positions = posRef.current;
		if (!renderer || !snapshot || snapshot.nodes.length === 0 || !positions) return;
		renderer.setData({
			nodes: snapshot.nodes.map((n) => ({
				id: n.id,
				x: positions.get(n.id)?.x ?? 0,
				y: positions.get(n.id)?.y ?? 0,
				label: n.name,
			})),
			edges: snapshot.edges.map((e) => ({ from: e.from, to: e.to })),
			logicalEdges: snapshot.logicalEdges.map((e) => ({ from: e.from, to: e.to })),
			impLinks: snapshot.impLinks,
			clusters: snapshot.clusters.map((c) => ({ id: c.id, label: c.label, members: c.members })),
			colors: {
				node: tokenHex(NODE_COLOR_TOKEN),
				edge: tokenHex("--ring"),
				label: tokenHex("--muted-foreground"),
				hoverText: tokenHex("--foreground"),
			},
			fontFamily: getComputedStyle(document.body).fontFamily,
		});
	}, [snapshot, isEmpty]);

	// Feed #2 — the shared render settings (sizes + region/physics tuning).
	useEffect(() => {
		rendererRef.current?.setSettings(settings);
		rendererRef.current?.setRegionTuning(settings.regions);
		rendererRef.current?.setPhysicsTuning(settings.physics);
	}, [settings, isEmpty]);

	// Feed #3 — provenance: every node this session touched in the map.
	const sessionNodes = useMemo(() => {
		const set = new Set<string>();
		if (!snapshot) return set;
		for (const [id, sessions] of Object.entries(snapshot.nodeSessions)) {
			if (sessions.includes(chatId)) set.add(id);
		}
		return set;
	}, [snapshot, chatId]);
	useEffect(() => {
		rendererRef.current?.setHighlight(sessionNodes);
	}, [sessionNodes, isEmpty]);

	return (
		<div className="relative flex h-full min-h-0 flex-col bg-background" data-testid="session-graph">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
				<span className="font-ui text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Learning map
				</span>
				<Link
					href="/"
					className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Open full
				</Link>
			</div>

			<div className="relative min-h-0 flex-1">
				{isEmpty ? (
					<div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground">
						{snapshot === null
							? "Loading the map…"
							: "The map is empty. Extractions fill it as you learn."}
					</div>
				) : (
					<canvas
						ref={canvasRef}
						className="block h-full w-full cursor-grab active:cursor-grabbing"
						aria-label="Learning map"
					/>
				)}

				{/* The clicked node's statement — a quiet card at the pane's
				    bottom, dismissed by a camera move or the stage click. */}
				{selected && (
					<div
						className="absolute inset-x-2 bottom-2 rounded-lg border bg-card/95 p-3 text-xs shadow-lg backdrop-blur"
						data-testid="session-graph-node"
					>
						<div className="mb-1 flex items-start justify-between gap-2">
							<span className="font-medium text-card-foreground">{selected.node.name}</span>
							<button
								type="button"
								onClick={() => setSelected(null)}
								className="shrink-0 rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground"
								aria-label="Close node details"
							>
								×
							</button>
						</div>
						<p className="leading-snug text-muted-foreground">{selected.node.statement}</p>
						{sessionNodes.has(selected.node.id) && (
							<div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
								From this session
							</div>
						)}
					</div>
				)}
			</div>

			<div className="shrink-0 px-3 py-2 text-[11px] text-muted-foreground">
				<span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle shadow-[0_0_6px_var(--color-primary)]" />
				Glowing nodes came from this session
			</div>
		</div>
	);
}
