import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pdfInfo, pdfExtract, pdfProbe } from "./pdf-ops.ts";
import { standardFontsDir } from "./pdf-ops.ts";

export interface ExtractedFigure {
	page: number;
	figureNumber?: string;
	caption?: string;
	chapter?: string;
	section?: string;
	surroundingText?: string;
	concepts: string[];
	width: number;
	height: number;
	imageBuffer: Buffer;
	mimeType: string;
	extractionMethod: string;
}

export interface ExtractionResult {
	pages: number;
	figures: ExtractedFigure[];
}

const DPI = 150;

/** Render a single PDF page to a canvas (Skia) and return it. */
async function renderPageCanvas(pdfPath: string, pageNo: number): Promise<{ canvas: any; viewport: any; doc: any; task: any }> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const { createCanvas } = await import("@napi-rs/canvas");
	const data = new Uint8Array(await fs.readFile(path.resolve(pdfPath)));
	const loadingTask = pdfjs.getDocument({ data, standardFontDataUrl: standardFontsDir(), verbosity: 0 });
	const doc = await loadingTask.promise;
	const pg = await doc.getPage(pageNo);
	const viewport = pg.getViewport({ scale: DPI / 72 });
	const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
	const ctx = canvas.getContext("2d");
	await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
	return { canvas, viewport, doc, task: loadingTask };
}

function toPng(canvas: any): Buffer {
	return canvas.toBuffer("image/png");
}

/** Multiply two PDF transform matrices (6-element). */
function multiplyM(m1: number[], m2: number[]): number[] {
	const a1 = m1[0]!, b1 = m1[1]!, c1 = m1[2]!, d1 = m1[3]!, e1 = m1[4]!, f1 = m1[5]!;
	const a2 = m2[0]!, b2 = m2[1]!, c2 = m2[2]!, d2 = m2[3]!, e2 = m2[4]!, f2 = m2[5]!;
	return [
		a1 * a2 + c1 * b2,
		b1 * a2 + d1 * b2,
		a1 * c2 + c1 * d2,
		b1 * c2 + d1 * d2,
		a1 * e2 + c1 * f2 + e1,
		b1 * e2 + d1 * f2 + f1,
	];
}

/** Extract image bounding boxes (in PDF user space) from a page's operator list. */
async function imageBoxes(pdfPath: string, pageNo: number): Promise<{ x: number; y: number; w: number; h: number }[]> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const data = new Uint8Array(await fs.readFile(path.resolve(pdfPath)));
	const loadingTask = pdfjs.getDocument({ data, standardFontDataUrl: standardFontsDir(), verbosity: 0 });
	const doc = await loadingTask.promise;
	try {
		const pg = await doc.getPage(pageNo);
		const viewport = pg.getViewport({ scale: DPI / 72 });
		const ops = await pg.getOperatorList();
		const boxes: { x: number; y: number; w: number; h: number }[] = [];
		const stack: number[][] = [];
		let ctm = [1, 0, 0, 1, 0, 0];
		for (let i = 0; i < ops.fnArray.length; i++) {
			const fn = ops.fnArray[i]!;
			const args = (ops.argsArray[i] ?? []) as unknown[];
			if (fn === pdfjs.OPS.save) stack.push([...ctm]);
			else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
			else if (fn === pdfjs.OPS.transform) {
				const m = args as number[];
				ctm = multiplyM([m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!], ctm);
			} else if (fn === pdfjs.OPS.paintImageXObject) {
				const a = ctm[0]!, b = ctm[1]!, c = ctm[2]!, d = ctm[3]!, e = ctm[4]!, f = ctm[5]!;
				const pts = [
					[0, 0], [1, 0], [1, 1], [0, 1],
				].map(([x, y]) => {
					const vx = a * x! + c * y! + e;
					const vy = b * x! + d * y! + f;
					const v = viewport.convertToViewportPoint(vx, vy);
					return v;
				});
				const xs = pts.map((p) => p[0]);
				const ys = pts.map((p) => p[1]);
				const minX = Math.min(...xs);
				const maxX = Math.max(...xs);
				const minY = Math.min(...ys);
				const maxY = Math.max(...ys);
				if (maxX - minX > 8 && maxY - minY > 8) {
					boxes.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
				}
			}
		}
		return boxes;
	} finally {
		await loadingTask.destroy().catch(() => {});
	}
}

function tokenizeConcepts(text: string): string[] {
	const stop = new Set(["the","and","for","are","but","not","you","all","can","had","her","was","one","our","out","has","have","this","that","with","from","they","will","what","when","how","why","which","page","figure","chapter"]);
	const words = (text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !stop.has(w));
	const uniq: string[] = [];
	for (const w of words) if (!uniq.includes(w)) uniq.push(w);
	return uniq.slice(0, 12);
}

function parseFigureNumber(caption: string): string | undefined {
	const m = caption.match(/(Figure|Fig\.?)\s*(\d+(?:\.\d+)?)/i);
	if (!m) return undefined;
	return `Figure ${m[2] ?? ""}`;
}

function findCaptions(text: string): string[] {
	const matches = [...text.matchAll(/((?:Figure|Fig\.?)\s*\d+(?:\.\d+)?[^\n]*)/gi)];
	return matches.map((m) => (m[1] ?? "").trim()).filter(Boolean);
}

function trackChapterSection(text: string, state: { chapter?: string; section?: string }): void {
	for (const line of text.split("\n")) {
		const t = line.trim();
		let m = t.match(/^(?:Chapter)\s+(\d+|[IVXLC]+)[:.\s]*(.*)$/i);
		if (m) { state.chapter = `Chapter ${m[1] ?? ""}${m[2] ? " " + (m[2] ?? "").trim() : ""}`.trim(); continue; }
		m = t.match(/^(\d+\.\d+)\s+(.+)$/);
		if (m && (m[2] ?? "").length < 80) { state.section = `${m[1] ?? ""} ${(m[2] ?? "").trim()}`; }
	}
}

export async function extractDocumentFigures(filePath: string): Promise<ExtractionResult> {
	await pdfProbe(filePath);
	const info = await pdfInfo(filePath);
	const state = { chapter: undefined as string | undefined, section: undefined as string | undefined };
	const figures: ExtractedFigure[] = [];
	for (let page = 1; page <= info.page_count; page++) {
		let pageText = "";
		try {
			pageText = await pdfExtract(filePath, String(page));
		} catch {
			pageText = "";
		}
		trackChapterSection(pageText, state);
		const captions = findCaptions(pageText);
		const pageImageCount = info.pages[page - 1]?.image_count ?? 0;

		// Render page once (used for fallback and cropping).
		let canvas: any = null;
		let pngBuffer: Buffer | null = null;
		const ensureCanvas = async () => {
			if (canvas) return canvas;
			const r = await renderPageCanvas(filePath, page);
			canvas = r.canvas;
			// keep task ref for cleanup? We'll destroy at end of page via r.task
			(r as any)._task = r.task;
			return canvas;
		};

		const makeFigure = async (caption: string | undefined, method: string, cropBox?: { x: number; y: number; w: number; h: number }) => {
			const c = await ensureCanvas();
			let buf: Buffer;
			let w = c.width;
			let h = c.height;
			let extractionMethod = method;
			if (cropBox) {
				const pad = 6;
				const sx = Math.max(0, Math.floor(cropBox.x) - pad);
				const sy = Math.max(0, Math.floor(cropBox.y) - pad);
				const sw = Math.min(c.width - sx, Math.ceil(cropBox.w) + pad * 2);
				const sh = Math.min(c.height - sy, Math.ceil(cropBox.h) + pad * 2);
				if (sw > 20 && sh > 20) {
					const { createCanvas } = await import("@napi-rs/canvas");
					const out = createCanvas(sw, sh);
					const octx = out.getContext("2d");
					octx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
					buf = out.toBuffer("image/png");
					w = sw; h = sh;
					extractionMethod = "embedded-image-crop";
				} else {
					buf = toPng(c);
					extractionMethod = "page-render";
				}
			} else {
				buf = toPng(c);
			}
			const surrounding = caption
				? pageText.slice(Math.max(0, pageText.indexOf(caption) - 200), pageText.indexOf(caption) + 400)
				: pageText.slice(0, 600);
			const concepts = tokenizeConcepts((caption ?? "") + " " + surrounding + " " + (state.chapter ?? "") + " " + (state.section ?? ""));
			return {
				page,
				figureNumber: caption ? parseFigureNumber(caption) : undefined,
				caption: caption || (pageImageCount > 0 ? `Illustration on page ${page}` : undefined),
				chapter: state.chapter,
				section: state.section,
				surroundingText: surrounding.trim() || undefined,
				concepts,
				width: w,
				height: h,
				imageBuffer: buf,
				mimeType: "image/png",
				extractionMethod,
			} as ExtractedFigure;
		};

		// Determine crop boxes
		let boxes: { x: number; y: number; w: number; h: number }[] = [];
		if (pageImageCount > 0) {
			try {
				boxes = await imageBoxes(filePath, page);
			} catch {
				boxes = [];
			}
		}

		if (captions.length > 0) {
			for (const cap of captions) {
				let box: { x: number; y: number; w: number; h: number } | undefined;
				if (boxes.length > 0) box = boxes.shift();
				const fig = await makeFigure(cap, box ? "embedded-image-crop" : "page-render", box);
				figures.push(fig);
			}
			// If more embedded images than captions, add remaining as illustrations
			for (const box of boxes) {
				const fig = await makeFigure(undefined, "embedded-image-crop", box);
				figures.push(fig);
			}
		} else if (pageImageCount > 0) {
			if (boxes.length > 0) {
				for (const box of boxes) {
					const fig = await makeFigure(undefined, "embedded-image-crop", box);
					figures.push(fig);
				}
			} else {
				const fig = await makeFigure(undefined, "page-render", undefined);
				figures.push(fig);
			}
		}
		// cleanup canvas task
		// best-effort: no explicit destroy needed for canvas
	}

	return { pages: info.page_count, figures };
}
