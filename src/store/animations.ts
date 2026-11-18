import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import type { AnimationRecord } from "../core/contracts.ts";

const ANIM_DIR = path.join(PATHS.data, "animations");
const ARTIFACT_DIR = path.join(ANIM_DIR, "artifacts");

function animFile(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid animation id: ${id}`);
	return path.join(ANIM_DIR, `${id}.json`);
}

function ensureDirs() {
	fs.mkdirSync(ANIM_DIR, { recursive: true });
	fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

export function listAnimations(owner?: string): AnimationRecord[] {
	ensureDirs();
	try {
		return fs
			.readdirSync(ANIM_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => {
				try {
					return JSON.parse(fs.readFileSync(path.join(ANIM_DIR, f), "utf-8")) as AnimationRecord;
				} catch {
					return null;
				}
			})
			.filter((a): a is AnimationRecord => a !== null && (!owner || a.owner === owner))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	} catch {
		return [];
	}
}

export function getAnimation(id: string): AnimationRecord | null {
	try {
		return JSON.parse(fs.readFileSync(animFile(id), "utf-8")) as AnimationRecord;
	} catch {
		return null;
	}
}

export function createAnimation(record: AnimationRecord): AnimationRecord {
	ensureDirs();
	fs.writeFileSync(animFile(record.id), JSON.stringify(record, null, "\t"), "utf-8");
	return record;
}

export function updateAnimation(id: string, patch: Partial<AnimationRecord>): AnimationRecord | null {
	const rec = getAnimation(id);
	if (!rec) return null;
	const next: AnimationRecord = { ...rec, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
	fs.writeFileSync(animFile(next.id), JSON.stringify(next, null, "\t"), "utf-8");
	return next;
}

export function deleteAnimation(id: string): boolean {
	try {
		fs.unlinkSync(animFile(id));
		const artifact = path.join(ARTIFACT_DIR, `${id}.mp4`);
		if (fs.existsSync(artifact)) fs.unlinkSync(artifact);
		return true;
	} catch {
		return false;
	}
}

export function artifactPath(id: string): string {
	ensureDirs();
	return path.join(ARTIFACT_DIR, `${id}.mp4`);
}

export function hasArtifact(id: string): boolean {
	return fs.existsSync(path.join(ARTIFACT_DIR, `${id}.mp4`));
}
