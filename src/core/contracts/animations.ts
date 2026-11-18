/** Animation domain contracts. */

export type AnimationStatus =
	| "draft"
	| "queued"
	| "rendering"
	| "ready"
	| "failed"
	| "cancelled";

export type AnimationQuality = "preview" | "standard" | "high";

export interface AnimationSceneSpec {
	title: string;
	description: string;
	narration?: string;
	equation?: string;
}

export interface AnimationSpec {
	title: string;
	subject: string;
	topic: string;
	learningObjective: string;
	targetLevel?: string;
	prerequisites?: string[];
	scenes: AnimationSceneSpec[];
	keyTakeaways?: string[];
	misconceptions?: string[];
	knowledgeChecks?: string[];
	sourceRefs?: string[];
}

export interface AnimationRecord {
	id: string;
	owner: string;
	title: string;
	subject: string;
	topic: string;
	learningObjective: string;
	spec?: AnimationSpec;
	code: string;
	sceneName: string;
	status: AnimationStatus;
	quality: AnimationQuality;
	renderJobId?: string;
	artifactPath?: string;
	durationSeconds?: number;
	courseId?: string;
	chatId?: string;
	favorite?: boolean;
	createdAt: string;
	updatedAt: string;
	error?: string;
	metadata?: Record<string, unknown>;
}
