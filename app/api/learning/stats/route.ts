import { NextResponse } from "next/server";
import { learningStore } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	learningStore.seedDefaultSkills();
	return NextResponse.json({
		skills: learningStore.listSkills(),
		mastery: learningStore.listMastery(),
		stats: learningStore.stats(),
		misconceptions: learningStore.listMisconceptions(),
	});
}
