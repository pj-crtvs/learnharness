"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FigureViewer } from "@/components/figure-viewer";

interface Document { id: string; name: string; pages: number; status: string; error?: string; uploadedAt: string; }
interface Figure { id: string; documentId: string; page: number; figureNumber?: string; caption?: string; chapter?: string; section?: string; width: number; height: number; extractionMethod: string; }

export default function DocumentsPage() {
	const [docs, setDocs] = useState<Document[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [figures, setFigures] = useState<Figure[]>([]);
	const [query, setQuery] = useState("");
	const [uploading, setUploading] = useState(false);
	const [status, setStatus] = useState("");

	const refresh = useCallback(async () => {
		const res = await fetch("/api/documents", { cache: "no-store" });
		const d = await res.json();
		setDocs(d.documents ?? []);
	}, []);

	useEffect(() => { void refresh(); }, [refresh]);

	const loadFigures = useCallback(async (id: string, q?: string) => {
		const url = q ? `/api/documents/${id}/figures?q=${encodeURIComponent(q)}` : `/api/documents/${id}/figures`;
		const res = await fetch(url, { cache: "no-store" });
		const d = await res.json();
		setFigures(d.figures ?? []);
	}, []);

	useEffect(() => {
		if (selected) void loadFigures(selected, query);
	}, [selected, query, loadFigures]);

	const handleUpload = async (file: File) => {
		setUploading(true);
		setStatus("Uploading and extracting figures…");
		try {
			const form = new FormData();
			form.append("file", file);
			const res = await fetch("/api/documents", { method: "POST", body: form });
			if (!res.ok) throw new Error(await res.text());
			const d = await res.json();
			setStatus(`Processed ${d.document?.name ?? file.name} (${d.document?.status}).`);
			await refresh();
			if (d.document?.id) setSelected(d.document.id);
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err));
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="mx-auto max-w-6xl p-6 space-y-6">
			<h1 className="text-2xl font-bold">Textbook figures</h1>
			<p className="text-sm text-muted-foreground">Upload a PDF textbook to extract and search its illustrations.</p>

			<div
				className="rounded-lg border border-dashed p-6 text-center space-y-2"
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleUpload(f); }}
			>
				<div className="font-medium">Upload PDF textbook</div>
				<input type="file" accept="application/pdf" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />
				{status && <div className="text-xs text-muted-foreground">{status}</div>}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="rounded-lg border p-4 space-y-2">
					<div className="font-medium">Documents</div>
					{docs.length === 0 && <div className="text-xs text-muted-foreground">No documents uploaded.</div>}
					{docs.map((d) => (
						<button
							key={d.id}
							onClick={() => setSelected(d.id)}
							className={`block w-full text-left rounded border p-2 text-sm ${selected === d.id ? "bg-accent" : ""}`}
						>
							<div className="font-medium">{d.name}</div>
							<div className="text-xs text-muted-foreground">{d.pages} pages · {d.status}</div>
						</button>
					))}
				</div>
				<div className="md:col-span-2 space-y-4">
					{selected && (
						<div className="flex gap-2">
							<Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search figures in this document…" />
						</div>
					)}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{figures.map((f) => (
							<div key={f.id} className="rounded-lg border p-3 space-y-2">
								<FigureViewer
									src={`/api/documents/${f.documentId}/figures/${f.id}/image`}
									caption={f.caption ?? f.figureNumber}
									source={`SOURCE: ${docs.find((d) => d.id === f.documentId)?.name ?? ""}\nCHAPTER: ${f.chapter ?? "—"}\nFIGURE: ${f.figureNumber ?? "—"}\nPAGE: ${f.page}`}
								/>
							</div>
						))}
					</div>
					{selected && figures.length === 0 && <div className="text-xs text-muted-foreground">No figures found.</div>}
				</div>
			</div>
		</div>
	);
}
