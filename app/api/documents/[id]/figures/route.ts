import { NextResponse } from "next/server";
import { documentStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const url = new URL(request.url);
	const q = url.searchParams.get("q") ?? "";
	const chapter = url.searchParams.get("chapter") ?? undefined;
	let figs = documentStore.listFigures(id);
	if (q) figs = documentStore.searchFigures({ query: q, documentId: id, chapter });
	return NextResponse.json({ figures: figs });
}
