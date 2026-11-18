import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PATHS } from "@/config";
import { documentStore, extractDocumentFigures, pdfInfo, pdfProbe } from "@/src/server";
export const dynamic = "force-dynamic";

export async function GET() {
	const docs = documentStore.listDocuments();
	return NextResponse.json({ documents: docs });
}

export async function POST(request: Request) {
	const form = await request.formData();
	const file = form.get("file");
	if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
	if (!file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "only PDF supported" }, { status: 400 });
	if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: "file too large (100MB max)" }, { status: 400 });

	const dir = path.join(PATHS.data, "uploads");
	fs.mkdirSync(dir, { recursive: true });
	const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
	const filePath = path.join(dir, `${Date.now()}_${safe}`);
	const buf = Buffer.from(await file.arrayBuffer());
	fs.writeFileSync(filePath, buf);

	try {
		await pdfProbe(filePath);
		const info = await pdfInfo(filePath);
		const doc = documentStore.createDocument({ name: file.name, path: filePath, pages: info.page_count, size: file.size });

		// Extract figures (synchronous for availability).
		try {
			const result = await extractDocumentFigures(filePath);
			const figDir = path.join(PATHS.data, "uploads", "figures", doc.id);
			fs.mkdirSync(figDir, { recursive: true });
			const figInputs = result.figures.map((f, idx) => {
				const fileName = `fig_${idx + 1}.png`;
				const abs = path.join(figDir, fileName);
				fs.writeFileSync(abs, f.imageBuffer);
				return {
					page: f.page,
					figureNumber: f.figureNumber,
					caption: f.caption,
					chapter: f.chapter,
					section: f.section,
					surroundingText: f.surroundingText,
					concepts: f.concepts,
					width: f.width,
					height: f.height,
					imageFile: path.join("uploads", "figures", doc.id, fileName),
					mimeType: f.mimeType,
					extractionMethod: f.extractionMethod,
				};
			});
			documentStore.addFigures(doc.id, figInputs);
			documentStore.updateDocument(doc.id, { status: "ready" });
		} catch (err) {
			documentStore.updateDocument(doc.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
		}

		return NextResponse.json({ document: documentStore.getDocument(doc.id) });
	} catch (err) {
		try { fs.unlinkSync(filePath); } catch {}
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
	}
}
