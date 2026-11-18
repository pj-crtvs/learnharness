import fs from "node:fs";
import { NextResponse } from "next/server";
import { documentStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const doc = documentStore.getDocument(id);
	if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
	const figures = documentStore.listFigures(id);
	return NextResponse.json({ document: doc, figures });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	documentStore.deleteDocument(id);
	return NextResponse.json({ ok: true });
}
