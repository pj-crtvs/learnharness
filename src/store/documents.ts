import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";

export interface FigureRecord {
	id: string;
	documentId: string;
	page: number;
	figureNumber?: string;
	caption?: string;
	chapter?: string;
	section?: string;
	surroundingText?: string;
	concepts: string[];
	width: number;
	height: number;
	imageFile: string;
	mimeType: string;
	extractionMethod: string;
	createdAt: string;
}

export interface DocumentRecord {
	id: string;
	name: string;
	path: string;
	pages: number;
	size: number;
	status: "processing" | "ready" | "failed";
	error?: string;
	uploadedAt: string;
	updatedAt: string;
}

interface StoreData {
	documents: DocumentRecord[];
	figures: FigureRecord[];
}

const FILE = path.join(PATHS.data, "documents.json");

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		return { documents: parsed.documents ?? [], figures: parsed.figures ?? [] };
	} catch {
		return { documents: [], figures: [] };
	}
}

function save(data: StoreData): void {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function now(): string {
	return new Date().toISOString();
}

function makeId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const documentStore = {
	listDocuments(): DocumentRecord[] {
		return load().documents.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
	},
	getDocument(id: string): DocumentRecord | null {
		return load().documents.find((d) => d.id === id) ?? null;
	},
	createDocument(input: { name: string; path: string; pages: number; size: number }): DocumentRecord {
		const data = load();
		const doc: DocumentRecord = {
			id: makeId("doc"),
			name: input.name,
			path: input.path,
			pages: input.pages,
			size: input.size,
			status: "processing",
			uploadedAt: now(),
			updatedAt: now(),
		};
		data.documents.push(doc);
		save(data);
		return doc;
	},
	updateDocument(id: string, patch: Partial<DocumentRecord>): DocumentRecord | null {
		const data = load();
		const doc = data.documents.find((d) => d.id === id);
		if (!doc) return null;
		Object.assign(doc, patch, { updatedAt: now() });
		save(data);
		return doc;
	},
	deleteDocument(id: string): void {
		const data = load();
		data.documents = data.documents.filter((d) => d.id !== id);
		data.figures = data.figures.filter((f) => f.documentId !== id);
		save(data);
		try {
			const dir = path.join(PATHS.data, "uploads", "figures", id);
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* best-effort */
		}
	},
	listFigures(documentId?: string): FigureRecord[] {
		const data = load();
		const figs = documentId ? data.figures.filter((f) => f.documentId === documentId) : data.figures;
		return figs.sort((a, b) => a.page - b.page || a.id.localeCompare(b.id));
	},
	getFigure(documentId: string, figureId: string): FigureRecord | null {
		return load().figures.find((f) => f.documentId === documentId && f.id === figureId) ?? null;
	},
	addFigures(documentId: string, figures: Omit<FigureRecord, "id" | "documentId" | "createdAt">[]): FigureRecord[] {
		const data = load();
		const created: FigureRecord[] = [];
		for (const fig of figures) {
			const rec: FigureRecord = {
				id: makeId("fig"),
				documentId,
				createdAt: now(),
				...fig,
			};
			data.figures.push(rec);
			created.push(rec);
		}
		save(data);
		return created;
	},
	searchFigures(opts: { query: string; documentId?: string; chapter?: string; limit?: number }): FigureRecord[] {
		const data = load();
		const limit = opts.limit ?? 8;
		const tokens = expandTokens(tokenize(opts.query));
		let candidates = data.figures;
		if (opts.documentId) candidates = candidates.filter((f) => f.documentId === opts.documentId);
		if (opts.chapter) candidates = candidates.filter((f) => (f.chapter ?? "").toLowerCase().includes(opts.chapter!.toLowerCase()));
		const scored = candidates.map((f) => {
			const haystack = [f.caption, f.chapter, f.section, f.surroundingText, ...(f.concepts ?? [])].filter(Boolean).join(" ").toLowerCase();
			let score = 0;
			for (const t of tokens) {
				if (haystack.includes(t)) {
					// weight caption and concepts higher
					if ((f.caption ?? "").toLowerCase().includes(t)) score += 3;
					if ((f.concepts ?? []).some((c) => c.toLowerCase().includes(t))) score += 2;
					if ((f.chapter ?? "").toLowerCase().includes(t) || (f.section ?? "").toLowerCase().includes(t)) score += 2;
					score += 1;
				}
			}
			// bonus for figure number mentions
			if (opts.query.match(/figure\s*\d/i) && f.figureNumber && opts.query.toLowerCase().includes(f.figureNumber.toLowerCase())) score += 5;
			return { fig: f, score };
		});
		return scored
			.filter((s) => s.score > 0 || tokens.length === 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((s) => s.fig);
	},
};

function tokenize(s: string): string[] {
	return (s || "")
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.map((t) => t.trim())
		.filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const SYNONYMS: Record<string, string[]> = {
	collision: ["impact", "collide", "crash"],
	momentum: ["impulse", "p"],
	impulse: ["momentum", "force", "time"],
	velocity: ["speed", "v"],
	acceleration: ["a", "force"],
	force: ["newton", "f"],
	energy: ["kinetic", "potential", "work"],
	graph: ["plot", "chart", "curve"],
	figure: ["diagram", "illustration", "image"],
};

function expandTokens(tokens: string[]): string[] {
	const out = new Set(tokens);
	for (const t of tokens) {
		for (const syn of SYNONYMS[t] ?? []) out.add(syn);
	}
	return [...out];
}

const STOPWORDS = new Set([
	"the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "have", "this", "that", "with", "from", "they", "will", "what", "when", "how", "why", "which",
]);
