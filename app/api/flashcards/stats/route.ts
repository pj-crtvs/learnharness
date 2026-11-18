import { NextResponse } from "next/server";
import { flashcardStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ stats: flashcardStore.stats() });
}
