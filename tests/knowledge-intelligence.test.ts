import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// data dir seam
process.env.LH_DATA_DIR = mkdtempSync(join(tmpdir(), "lh-ki-"));

import {
	detectPrerequisiteCycles,
	validateKnowledgeNode,
	validateKnowledgeEdge,
	getPrerequisites,
	transitivePrerequisites,
	topologicalOrder,
	computeMasteryState,
	classifyConfidence,
	validateKnowledgeGraphInput,
} from "../src/core/knowledge-intelligence.ts";
import { runEvaluationCycle } from "../src/agent/knowledge-intelligence/evaluation-cycle.ts";
import { knowledgeIntelligenceStore } from "../src/server";

test("cycle detection finds cycle", () => {
	const nodes = [{ id: "a", name: "A", type: "concept", createdAt: "x", updatedAt: "x" }, { id: "b", name: "B", type: "concept", createdAt: "x", updatedAt: "x" }] as any;
	const edges = [
		{ id: "e1", source: "a", target: "b", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
		{ id: "e2", source: "b", target: "a", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
	] as any;
	const res = detectPrerequisiteCycles(nodes, edges);
	assert.equal(res.hasCycle, true);
});

test("cycle detection no cycle", () => {
	const nodes = [{ id: "a", name: "A", type: "concept", createdAt: "x", updatedAt: "x" }, { id: "b", name: "B", type: "concept", createdAt: "x", updatedAt: "x" }] as any;
	const edges = [{ id: "e1", source: "a", target: "b", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" }] as any;
	const res = detectPrerequisiteCycles(nodes, edges);
	assert.equal(res.hasCycle, false);
});

test("validate node", () => {
	assert.deepEqual(validateKnowledgeNode({ id: "1", name: "X", type: "concept" }), []);
	assert.ok(validateKnowledgeNode({} as any).length > 0);
});

test("validate edge unknown node", () => {
	const errs = validateKnowledgeEdge({ id: "e", source: "a", target: "b", type: "requires" } as any, new Set(["a"]));
	assert.ok(errs.some((e) => e.includes("unknown target")));
});

test("validate graph input cycle", () => {
	const nodes = [{ id: "a", name: "A", type: "concept", createdAt: "x", updatedAt: "x" }, { id: "b", name: "B", type: "concept", createdAt: "x", updatedAt: "x" }] as any;
	const edges = [
		{ id: "e1", source: "a", target: "b", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
		{ id: "e2", source: "b", target: "a", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
	] as any;
	const r = validateKnowledgeGraphInput(nodes, edges);
	assert.equal(r.valid, false);
});

test("prereq traversal", () => {
	const edges = [
		{ id: "e1", source: "a", target: "b", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
		{ id: "e2", source: "b", target: "c", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
	] as any;
	assert.deepEqual(getPrerequisites("b", edges), ["a"]);
	assert.deepEqual(transitivePrerequisites("c", edges), ["b", "a"]);
});

test("topological order", () => {
	const edges = [
		{ id: "e1", source: "a", target: "b", type: "requires", verified: false, aiProposed: true, createdAt: "x", updatedAt: "x" },
	] as any;
	const order = topologicalOrder(["a", "b"], edges);
	assert.deepEqual(order, ["a", "b"]);
});

test("mastery state", () => {
	const ev = [{ id: "1", studentId: "s", conceptId: "c", sourceType: "assessment", correct: true, score: 0.9, independent: true, timestamp: "x" }] as any;
	assert.equal(computeMasteryState(ev), "proficient");
	assert.equal(computeMasteryState([]), "not_introduced");
});

test("confidence label", () => {
	assert.equal(classifyConfidence(2), "low");
	assert.equal(classifyConfidence(10), "high");
});

test("store CRUD nodes/edges", () => {
	const node = knowledgeIntelligenceStore.createNode({ name: "Vector", type: "concept", verificationStatus: "verified" } as any);
	assert.ok(node.id);
	const edge = knowledgeIntelligenceStore.createEdge({ source: node.id, target: node.id, type: "related_to", verified: true, aiProposed: false } as any);
	// self-loop allowed in store (validation catches later)
	assert.ok(edge.id);
	const fetched = knowledgeIntelligenceStore.getNode(node.id);
	assert.equal(fetched?.name, "Vector");
});

test("evaluation cycle bounded", () => {
	let calls = 0;
	const res = runEvaluationCycle<number>({
		generate: () => 1,
		validateStructure: () => [],
		evaluateContent: (o: number) => ({
			id: "e", targetType: "knowledge_graph", targetId: "g", decision: "revise", overallQuality: 50,
			criteria: { factualAccuracy: 50, relationshipAccuracy: 50, prerequisiteValidity: 50, evidenceQuality: 50, logicalConsistency: 50, pedagogicalQuality: 50 },
			identifiedErrors: [], unsupportedClaims: [], missingEvidence: [], recommendedChanges: [], reasoningSummary: "", requiresHumanReview: false, createdAt: new Date().toISOString(),
		}),
		revise: (o: number) => { calls++; return o + 1; },
		maxRevisions: 2,
	});
	assert.equal(calls, 2);
	assert.equal(res.decision, "revise");
});