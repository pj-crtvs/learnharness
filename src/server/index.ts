/**
 * THE SERVER-SIDE SURFACE — the only src module (besides the core barrel)
 * that app/ may import. Route handlers and server components come through
 * here; nothing under app/ touches src/store or src/agent directly.
 */

export * from "./chat-handler.ts";
export * from "./events-stream.ts";
export * from "./chats.ts";
export * from "./graph.ts";
export { NotesImportError } from "../agent/subagents/extraction.ts";
export * from "./commit-positions.ts";
export * from "./jobs.ts";
export * from "./stores.ts";
export { explainStore } from "../store/explain.ts";
export { getHeadless } from "../agent/subagents/headless.ts";
export { dostStore } from "../store/dost.ts";
export { learningStore } from "../store/learning.ts";
export { piEngineForSpec } from "../agent/models.ts";
export { runSubagent } from "../agent/subagents/pi-run.ts";
export { pdfProbe, pdfInfo, pdfExtract } from "../agent/subagents/pdf-ops.ts";
export { extractDocumentFigures } from "../agent/subagents/document-figures.ts";export { flashcardStore } from "../store/flashcards.ts";
export { examReadinessStore } from "../store/exam-readiness.ts";
export { documentStore } from "../store/documents.ts";export { readRenderSettings, writeRenderSettings } from "../store/render-settings.ts";
export { listAnimations, getAnimation, createAnimation, updateAnimation, deleteAnimation, artifactPath, hasArtifact } from "../store/animations.ts";
// The settings record + prompt overrides (settings-storage wave, 2026-09-19).
// The *Record aliases keep the app/api/settings routes explicit about which
// seam they touch (the raw record, not the chat-section convenience view).
export {
	readSettings as readSettingsRecord,
	writeSettings as writeSettingsRecord,
	settingsStore,
} from "../store/settings.ts";
export { promptOverrides } from "../store/prompt-overrides.ts";
export { isValidSegmentPath } from "../core/prompt-segments.ts";
// The canonical segment discovery/resolution lives in the agent layer
// (composition is an agent concern); the barrel re-exports it for the
// routes — server→agent is the lawful direction (chat-handler precedent).
export { effectivePromptSegments, allSegmentPaths, readPromptOverride } from "../agent/prompt-segments.ts";

// The auth/keys composition (auth-keys wave, 2026-09-19): the curated
// key catalog + the env-reflecting store behind GET/PUT/DELETE /api/keys.
// Importing this module runs the idempotent boot fill-gap — every consumer
// keeps its plain process.env reads (that seam is the point).
export * from "./keys.ts";
export * from "./search.ts";
export { authStore } from "../store/auth.ts";
export * from "./settings-body.ts";
export * from "./turn-liveness.ts";
export * from "./turn-runs.ts";
export * from "./dismissal-park.ts";
export * from "./compaction.ts";
export { runPiTurn, piTurnResponse, type PiTurnHandle, type PiTurnSpec } from "./pi/ui-stream.ts";
export * from "./observability.ts";
export * from "./model-catalog.ts";
export * from "./custom-providers.ts";
export { sessionCost } from "./pricing.ts";
export * from "./manim-renderer.ts";
export { generateManimAnimation } from "./manim-generation.ts";
