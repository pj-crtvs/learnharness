import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
	listAnimations,
	createAnimation,
	generateManimAnimation,
} from "@/src/server";
import type { AnimationRecord } from "@/src/core";

export async function GET(req: NextRequest) {
	const owner = req.nextUrl.searchParams.get("owner") || "local";
	const chatId = req.nextUrl.searchParams.get("chatId");
	let items = listAnimations(owner);
	if (chatId) items = items.filter((a) => a.chatId === chatId);
	return NextResponse.json({ animations: items });
}

export async function POST(req: NextRequest) {
	let body: Record<string, unknown> = {};
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "invalid json" }, { status: 400 });
	}

	// If generate=true, run AI generation.
	if (body.generate === true) {
		try {
			const result = await generateManimAnimation({
				topic: String(body.topic || ""),
				subject: body.subject ? String(body.subject) : undefined,
				learningObjective: body.learningObjective ? String(body.learningObjective) : undefined,
				difficulty: body.difficulty ? String(body.difficulty) : undefined,
				duration: body.duration ? Number(body.duration) : undefined,
				style: body.style ? String(body.style) : undefined,
				equation: body.equation ? String(body.equation) : undefined,
			});
			const now = new Date().toISOString();
			const record: AnimationRecord = {
				id: randomUUID(),
				owner: String(body.owner || "local"),
				title: result.title,
				subject: result.subject,
				topic: result.topic,
				learningObjective: result.learningObjective,
				spec: result.spec,
				code: result.code,
				sceneName: result.sceneName,
				status: "draft",
				quality: "preview",
				courseId: body.courseId ? String(body.courseId) : undefined,
				chatId: body.chatId ? String(body.chatId) : undefined,
				createdAt: now,
				updatedAt: now,
				metadata: { explanation: result.explanation },
			};
			createAnimation(record);
			return NextResponse.json({ animation: record });
		} catch (e) {
			return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
		}
	}

	// Manual create
	const now = new Date().toISOString();
	const record: AnimationRecord = {
		id: randomUUID(),
		owner: String(body.owner || "local"),
		title: String(body.title || "Untitled animation"),
		subject: String(body.subject || "mathematics"),
		topic: String(body.topic || ""),
		learningObjective: String(body.learningObjective || ""),
		code: String(body.code || ""),
		sceneName: String(body.sceneName || "Scene"),
		status: "draft",
		quality: (body.quality as AnimationRecord["quality"]) || "preview",
		courseId: body.courseId ? String(body.courseId) : undefined,
		chatId: body.chatId ? String(body.chatId) : undefined,
		createdAt: now,
		updatedAt: now,
	};
	createAnimation(record);
	return NextResponse.json({ animation: record });
}
