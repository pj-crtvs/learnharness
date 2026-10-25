"use client";

import { useState } from "react";
import type {
	CustomModelConfig,
	CustomProviderConfig,
	SafeCustomProviderDto,
} from "@/src/core";

export function CustomProviderCard({
	provider,
	onSave,
	onDelete,
	initialEditing = false,
	onCancelNew,
}: {
	provider: SafeCustomProviderDto | null; // null if creating a new one
	onSave: (config: CustomProviderConfig) => Promise<string | null>;
	onDelete?: (id: string) => Promise<void>;
	initialEditing?: boolean;
	onCancelNew?: () => void;
}) {
	const isNew = provider === null;
	const [editing, setEditing] = useState(initialEditing || isNew);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [id, setId] = useState(provider?.id ?? "custom-");
	const [name, setName] = useState(provider?.name ?? "");
	const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
	const [dialect, setDialect] = useState<"openai-completions">("openai-completions");
	const [noKeyNeeded, setNoKeyNeeded] = useState(provider?.noKeyNeeded ?? false);
	const [apiKey, setApiKey] = useState("");
	const [models, setModels] = useState<CustomModelConfig[]>(
		provider?.models && provider.models.length > 0
			? provider.models
			: [
					{
						id: "auto",
						name: "auto",
						contextWindow: 1000000,
						maxTokens: 16384,
						reasoning: true,
						acceptsImages: true,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					},
				],
	);

	function updateModel(index: number, patch: Partial<CustomModelConfig>) {
		setModels((prev) => {
			const next = [...prev];
			const current = next[index];
			if (!current) return prev;
			next[index] = { ...current, ...patch };
			return next;
		});
	}

	function updateModelCost(
		index: number,
		costField: "input" | "output" | "cacheRead" | "cacheWrite",
		rawVal: string,
	) {
		setModels((prev) => {
			const next = [...prev];
			const current = next[index];
			if (!current) return prev;
			const val = rawVal === "" ? undefined : parseFloat(rawVal);
			const cost = { ...(current.cost ?? {}), [costField]: val };
			next[index] = { ...current, cost };
			return next;
		});
	}

	function addModel() {
		setModels((prev) => [
			...prev,
			{
				id: "",
				name: "",
				contextWindow: 1000000,
				maxTokens: 16384,
				reasoning: true,
				acceptsImages: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
		]);
	}

	function removeModel(index: number) {
		setModels((prev) => prev.filter((_, i) => i !== index));
	}

	async function handleSubmit() {
		if (busy) return;
		setError(null);
		setBusy(true);

		const err = await onSave({
			id: id.trim(),
			name: name.trim(),
			baseUrl: baseUrl.trim(),
			dialect,
			noKeyNeeded,
			apiKey: apiKey.trim() || undefined,
			models,
		});

		setBusy(false);
		if (err) {
			setError(err);
		} else {
			setApiKey("");
			setEditing(false);
		}
	}

	return (
		<div className="rounded-md border border-border/80 bg-card/40 p-3 font-mono text-xs">
			{/* Top Header */}
			<div className="flex items-center justify-between gap-3 pb-2 border-b border-border/50">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-foreground text-sm">
						{name || provider?.name || "New Custom Provider"}
					</span>
					<span className="text-muted-foreground text-xs">
						{id || provider?.id}
					</span>
				</div>
				<div className="flex items-center gap-3 text-xs">
					{provider?.keySaved && (
						<span className="text-muted-foreground/70">
							key saved {provider.maskedKey ? `(${provider.maskedKey})` : ""}
						</span>
					)}
					{!isNew && !editing && (
						<button
							type="button"
							onClick={() => setEditing(true)}
							className="font-medium text-foreground hover:underline"
						>
							Edit
						</button>
					)}
					{!isNew && onDelete && (
						<button
							type="button"
							onClick={() => onDelete(provider.id)}
							className="text-muted-foreground hover:text-red-500 hover:underline"
						>
							Delete
						</button>
					)}
					{isNew && onCancelNew && (
						<button
							type="button"
							onClick={onCancelNew}
							className="text-muted-foreground hover:text-foreground hover:underline"
						>
							Cancel
						</button>
					)}
				</div>
			</div>

			{/* Read-only view when not editing */}
			{!editing && provider && (
				<div className="pt-2 text-xs flex flex-col gap-1 text-muted-foreground">
					<div><span className="text-foreground/70">Base URL:</span> {provider.baseUrl}</div>
					<div><span className="text-foreground/70">Dialect:</span> OpenAI chat completions</div>
					<div>
						<span className="text-foreground/70">Models ({provider.models.length}):</span>{" "}
						{provider.models.map((m) => m.name || m.id).join(", ")}
					</div>
				</div>
			)}

			{/* Editor Form matching user screenshot */}
			{editing && (
				<div className="mt-3 flex flex-col gap-3">
					{/* Row 1: ID and Name */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-muted-foreground">
								Id (prefixed with custom-)
							</label>
							<input
								type="text"
								value={id}
								disabled={!isNew || busy}
								onChange={(e) => setId(e.target.value)}
								placeholder="custom-pandev"
								className="h-7 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground disabled:opacity-60"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-muted-foreground">Name</label>
							<input
								type="text"
								value={name}
								disabled={busy}
								onChange={(e) => setName(e.target.value)}
								placeholder="pandev"
								className="h-7 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground"
							/>
						</div>
					</div>

					{/* Row 2: Base URL and Dialect */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-muted-foreground">Base URL</label>
							<input
								type="text"
								value={baseUrl}
								disabled={busy}
								onChange={(e) => setBaseUrl(e.target.value)}
								placeholder="https://llmrouter.boyemma.com/v1"
								className="h-7 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-muted-foreground">Dialect</label>
							<select
								value={dialect}
								disabled={busy}
								onChange={(e) => setDialect(e.target.value as "openai-completions")}
								className="h-7 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground"
							>
								<option value="openai-completions">OpenAI chat completions</option>
							</select>
						</div>
					</div>

					{/* Row 3: No API key needed */}
					<div className="flex items-center gap-2 pt-1">
						<input
							type="checkbox"
							id={`no-key-${id}`}
							checked={noKeyNeeded}
							disabled={busy}
							onChange={(e) => setNoKeyNeeded(e.target.checked)}
							className="rounded border-border accent-foreground"
						/>
						<label htmlFor={`no-key-${id}`} className="text-xs text-foreground/90 cursor-pointer">
							No API key needed (local endpoint)
						</label>
					</div>

					{/* Row 4: API key */}
					{!noKeyNeeded && (
						<div className="flex flex-col gap-1">
							<label className="text-[11px] text-muted-foreground">
								API key (leave blank to keep the saved key)
							</label>
							<input
								type="password"
								value={apiKey}
								disabled={busy}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder={provider?.keySaved ? "••••••••••••••••••••••••••" : "Paste API key…"}
								className="h-7 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground"
							/>
						</div>
					)}

					{/* MODELS Header */}
					<div className="mt-2 border-t border-border/50 pt-2 flex items-center justify-between">
						<span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
							MODELS
						</span>
						<button
							type="button"
							onClick={addModel}
							className="text-[11px] text-foreground hover:underline"
						>
							+ Add model
						</button>
					</div>

					{/* Model List */}
					<div className="flex flex-col gap-3">
						{models.map((m, idx) => (
							<div
								key={idx}
								className="rounded border border-border/40 bg-background/50 p-2.5 flex flex-col gap-2"
							>
								{/* Model Row 1: ID, Name, Context, MaxTokens */}
								<div className="grid grid-cols-2 md:grid-cols-4 gap-2">
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground">Model id</label>
										<input
											type="text"
											value={m.id}
											disabled={busy}
											onChange={(e) => updateModel(idx, { id: e.target.value })}
											placeholder="auto"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground">Display name</label>
										<input
											type="text"
											value={m.name}
											disabled={busy}
											onChange={(e) => updateModel(idx, { name: e.target.value })}
											placeholder="auto"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground">Context window</label>
										<input
											type="number"
											value={m.contextWindow}
											disabled={busy}
											onChange={(e) =>
												updateModel(idx, { contextWindow: parseInt(e.target.value, 10) || 1000000 })
											}
											placeholder="1000000"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground">Max tokens</label>
										<input
											type="number"
											value={m.maxTokens}
											disabled={busy}
											onChange={(e) =>
												updateModel(idx, { maxTokens: parseInt(e.target.value, 10) || 4096 })
											}
											placeholder="16384"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
								</div>

								{/* Model Row 2: Accepts images, Reasoning, Remove model */}
								<div className="flex items-center justify-between pt-1 text-[11px]">
									<div className="flex items-center gap-4">
										<label className="flex items-center gap-1.5 cursor-pointer text-foreground">
											<input
												type="checkbox"
												checked={m.acceptsImages}
												disabled={busy}
												onChange={(e) => updateModel(idx, { acceptsImages: e.target.checked })}
												className="rounded border-border accent-foreground"
											/>
											Accepts images
										</label>
										<label className="flex items-center gap-1.5 cursor-pointer text-foreground">
											<input
												type="checkbox"
												checked={m.reasoning}
												disabled={busy}
												onChange={(e) => updateModel(idx, { reasoning: e.target.checked })}
												className="rounded border-border accent-foreground"
											/>
											Reasoning
										</label>
									</div>
									{models.length > 1 && (
										<button
											type="button"
											onClick={() => removeModel(idx)}
											className="text-muted-foreground hover:text-red-500 hover:underline"
										>
											Remove model
										</button>
									)}
								</div>

								{/* Model Row 3: Optional Token Costs */}
								<div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-border/30">
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground/70">
											Cost in, per M tokens
										</label>
										<input
											type="number"
											step="any"
											value={m.cost?.input ?? ""}
											disabled={busy}
											onChange={(e) => updateModelCost(idx, "input", e.target.value)}
											placeholder="0"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground/70">Cost out</label>
										<input
											type="number"
											step="any"
											value={m.cost?.output ?? ""}
											disabled={busy}
											onChange={(e) => updateModelCost(idx, "output", e.target.value)}
											placeholder="0"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground/70">Cache read</label>
										<input
											type="number"
											step="any"
											value={m.cost?.cacheRead ?? ""}
											disabled={busy}
											onChange={(e) => updateModelCost(idx, "cacheRead", e.target.value)}
											placeholder="0"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<label className="text-[10px] text-muted-foreground/70">Cache write</label>
										<input
											type="number"
											step="any"
											value={m.cost?.cacheWrite ?? ""}
											disabled={busy}
											onChange={(e) => updateModelCost(idx, "cacheWrite", e.target.value)}
											placeholder="0"
											className="h-6 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
										/>
									</div>
								</div>
							</div>
						))}
					</div>

					{/* Error message */}
					{error && (
						<p role="alert" className="text-xs text-red-500 font-medium">
							{error}
						</p>
					)}

					{/* Actions: Save / Cancel */}
					<div className="flex items-center gap-3 pt-2">
						<button
							type="button"
							onClick={handleSubmit}
							disabled={busy}
							className="rounded bg-foreground px-3 py-1 font-ui text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
						>
							{busy ? "Saving…" : "Save provider"}
						</button>
						<button
							type="button"
							onClick={() => {
								if (isNew && onCancelNew) onCancelNew();
								else setEditing(false);
							}}
							disabled={busy}
							className="text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
