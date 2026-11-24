import { NextRequest, NextResponse } from "next/server";
import { getAnimation, artifactPath } from "@/src/server";
import * as fs from "node:fs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const anim = getAnimation(id);
	if (!anim) return NextResponse.json({ error: "not found" }, { status: 404 });
	const local = artifactPath(id);
	if (!fs.existsSync(local)) {
		return NextResponse.json({ error: "artifact not ready" }, { status: 404 });
	}
	const stat = fs.statSync(local);
	const range = req.headers.get("range");
	if (range) {
		const match = /bytes=(\d+)-(\d*)/.exec(range);
		if (match) {
			const start = parseInt(match[1]!, 10);
			const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
			const chunkSize = end - start + 1;
			const buf = Buffer.alloc(chunkSize);
			const fd = fs.openSync(local, "r");
			fs.readSync(fd, buf, 0, chunkSize, start);
			fs.closeSync(fd);
			return new NextResponse(buf, {
				status: 206,
				headers: {
					"Content-Type": "video/mp4",
					"Content-Length": String(chunkSize),
					"Content-Range": `bytes ${start}-${end}/${stat.size}`,
					"Accept-Ranges": "bytes",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			});
		}
	}
	const file = fs.readFileSync(local);
	return new NextResponse(file, {
		status: 200,
		headers: {
			"Content-Type": "video/mp4",
			"Content-Length": String(stat.size),
			"Accept-Ranges": "bytes",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
