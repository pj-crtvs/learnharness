import { NextRequest, NextResponse } from "next/server";
import { getAnimation, updateAnimation, getRenderJob, fetchArtifact, artifactPath } from "@/src/server";
import * as fs from "node:fs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const anim = getAnimation(id);
	if (!anim) return NextResponse.json({ error: "not found" }, { status: 404 });
	if (!anim.renderJobId) return NextResponse.json({ animation: anim, job: null });

	try {
		const job = await getRenderJob(anim.renderJobId);
		let status = anim.status;
		let artifactPathValue: string | undefined;
		if (job.status === "done") {
			status = "ready";
			// download artifact if not present
			const local = artifactPath(id);
			if (!fs.existsSync(local)) {
				try {
					const buf = await fetchArtifact(anim.renderJobId);
					fs.writeFileSync(local, Buffer.from(buf));
					artifactPathValue = local;
				} catch (e) {
					status = "failed";
					updateAnimation(id, { status, error: e instanceof Error ? e.message : String(e) });
				}
			} else {
				artifactPathValue = local;
			}
		} else if (job.status === "failed" || job.status === "cancelled") {
			status = job.status === "cancelled" ? "cancelled" : "failed";
		} else {
			status = "rendering";
		}
		const updated = updateAnimation(id, {
			status,
			error: job.error ?? undefined,
			artifactPath: artifactPathValue,
		});
		return NextResponse.json({ animation: updated ?? anim, job });
	} catch (e) {
		return NextResponse.json({ animation: anim, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
	}
}
