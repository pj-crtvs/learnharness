"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SortingVisualizer() {
	const [arr, setArr] = useState<number[]>([5, 3, 8, 1, 9, 2, 7]);
	const [running, setRunning] = useState(false);
	const sort = async () => {
		setRunning(true);
		const a = [...arr];
		for (let i = 0; i < a.length; i++) {
			for (let j = 0; j < a.length - i - 1; j++) {
				if (a[j]! > a[j + 1]!) {
					[a[j], a[j + 1]] = [a[j + 1]!, a[j]!];
					setArr([...a]);
					await new Promise((r) => setTimeout(r, 200));
				}
			}
		}
		setRunning(false);
	};
	return (
		<div className="space-y-2">
			<div className="flex gap-1 items-end h-32">
				{arr.map((v, i) => (
					<div key={i} className="bg-primary w-8" style={{ height: `${v * 12}px` }} title={String(v)} />
				))}
			</div>
			<Button onClick={() => void sort()} disabled={running}>{running ? "Sorting…" : "Bubble sort"}</Button>
			<Button variant="outline" onClick={() => setArr([5, 3, 8, 1, 9, 2, 7])}>Reset</Button>
		</div>
	);
}

function StackVisualizer() {
	const [stack, setStack] = useState<number[]>([1, 2, 3]);
	const push = () => setStack((s) => [...s, Math.floor(Math.random() * 9) + 1]);
	const pop = () => setStack((s) => s.slice(0, -1));
	return (
		<div className="space-y-2">
			<div className="border rounded p-2 w-24 min-h-[120px] flex flex-col-reverse gap-1">
				{stack.map((v, i) => <div key={i} className="bg-accent text-center rounded">{v}</div>)}
			</div>
			<div className="flex gap-2">
				<Button onClick={push}>Push</Button>
				<Button variant="outline" onClick={pop}>Pop</Button>
			</div>
		</div>
	);
}

function RecursionVisualizer() {
	const [n, setN] = useState(5);
	const [frames, setFrames] = useState<number[]>([]);
	const run = async () => {
		setFrames([]);
		for (let i = n; i >= 1; i--) {
			setFrames((f) => [...f, i]);
			await new Promise((r) => setTimeout(r, 300));
		}
		for (let i = 1; i <= n; i++) {
			setFrames((f) => f.slice(0, -1));
			await new Promise((r) => setTimeout(r, 300));
		}
	};
	return (
		<div className="space-y-2">
			<Input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} className="w-20" />
			<Button onClick={() => void run()}>Run factorial({n})</Button>
			<div className="font-mono text-xs space-y-1">
				{frames.map((f, i) => <div key={i} className="border rounded px-2 py-1">factorial({f})</div>)}
			</div>
		</div>
	);
}

function TreeVisualizer() {
	const [depth, setDepth] = useState(3);
	const render = (d: number, label = "root"): any => {
		if (d <= 0) return null;
		return (
			<div className="flex flex-col items-center">
				<div className="rounded-full border px-2 py-1 text-xs">{label}</div>
				<div className="flex gap-4 mt-2">
					{render(d - 1, "L")}
					{render(d - 1, "R")}
				</div>
			</div>
		);
	};
	return (
		<div className="space-y-2">
			<Input type="number" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-20" />
			<div className="overflow-auto">{render(depth)}</div>
		</div>
	);
}

export default function VisualizersPage() {
	const [tab, setTab] = useState<"sort" | "stack" | "recursion" | "tree">("sort");
	return (
		<div className="mx-auto max-w-5xl p-6 space-y-4">
			<h1 className="text-2xl font-bold">CS Visualizers</h1>
			<div className="flex gap-2 flex-wrap">
				{(["sort","stack","recursion","tree"] as const).map((t) => <Button key={t} variant={tab===t?"default":"outline"} onClick={() => setTab(t)}>{t}</Button>)}
			</div>
			<div className="rounded border p-4">
				{tab === "sort" && <SortingVisualizer />}
				{tab === "stack" && <StackVisualizer />}
				{tab === "recursion" && <RecursionVisualizer />}
				{tab === "tree" && <TreeVisualizer />}
			</div>
		</div>
	);
}
