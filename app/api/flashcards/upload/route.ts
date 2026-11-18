import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PATHS } from "@/config";
import { pdfInfo, pdfExtract, pdfProbe } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const form = await request.formData();
	const file = form.get("file");
	if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
	if (!file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "only PDF supported" }, { status: 400 });
	if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "file too large (50MB max)" }, { status: 400 });

	const dir = path.join(PATHS.data, "uploads");
	fs.mkdirSync(dir, { recursive: true });
	const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
	const filePath = path.join(dir, `${Date.now()}_${safe}`);
	const buf = Buffer.from(await file.arrayBuffer());
	fs.writeFileSync(filePath, buf);

	try {
		await pdfProbe(filePath);
		const info = await pdfInfo(filePath);
		const text = await pdfExtract(filePath, "all");
		return NextResponse.json({
			document: { id: path.basename(filePath), name: file.name, path: filePath, pages: info.page_count, size: file.size },
			info,
			text,
		});
	} catch (err) {
		try { fs.unlinkSync(filePath); } catch {}
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
	}
}
