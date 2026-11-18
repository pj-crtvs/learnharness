import { NextResponse } from "next/server";
import { documentStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = await request.json().catch(() => ({}));
	const query = typeof body?.query === "string" ? body.query : "";
	const documentId = typeof body?.documentId === "string" ? body.documentId : undefined;
	const chapter = typeof body?.chapter === "string" ? body.chapter : undefined;
	const limit = typeof body?.limit === "number" ? body.limit : 8;
	const figs = documentStore.searchFigures({ query, documentId, chapter, limit });
	return NextResponse.json({ figures: figs.map((f) => ({ ...f, imageUrl: `/api/documents/${f.documentId}/figures/${f.id}/image` })) });
}
