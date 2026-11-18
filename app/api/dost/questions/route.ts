import { NextResponse } from "next/server";
import { dostStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const domain = url.searchParams.get("domain") as any;
	dostStore.ensureQuestions();
	return NextResponse.json({ questions: dostStore.listQuestions(domain), stats: dostStore.stats() });
}
