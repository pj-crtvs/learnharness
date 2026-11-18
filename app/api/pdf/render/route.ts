import { NextResponse } from "next/server";
import { getHeadless } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const pdfPath = typeof body?.path === "string" ? body.path : "";
	const page = Number(body?.page) || 1;
	if (!pdfPath) return NextResponse.json({ error: "path required" }, { status: 400 });
	try {
		const headless = getHeadless();
		const pages = await headless.renderPdfPages(pdfPath, [page]);
		const png = pages[0]?.png;
		if (!png) return NextResponse.json({ error: "render failed" }, { status: 500 });
		return NextResponse.json({ page, base64: png.toString("base64") });
	} catch (err) {
		return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
}
