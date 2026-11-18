import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import type {
	KnowledgeNode,
	KnowledgeEdge,
	StudentConceptMastery,
	LearningEvidence,
	DiagnosticSession,
	DiagnosticQuestion,
	DiagnosticResponse,
	RootCauseHypothesis,
	InterventionPlan,
	InterventionActivity,
	MasteryAssessment,
	AgentExecution,
	AgentEvaluation,
	GraphValidationRecord,
	GraphRevisionHistory,
} from "../core/contracts/knowledge-intelligence.ts";

interface StoreData {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	mastery: StudentConceptMastery[];
	evidence: LearningEvidence[];
	diagnosticSessions: DiagnosticSession[];
	diagnosticQuestions: DiagnosticQuestion[];
	diagnosticResponses: DiagnosticResponse[];
	hypotheses: RootCauseHypothesis[];
	interventionPlans: InterventionPlan[];
	interventionActivities: InterventionActivity[];
	masteryAssessments: MasteryAssessment[];
	agentExecutions: AgentExecution[];
	agentEvaluations: AgentEvaluation[];
	validationRecords: GraphValidationRecord[];
	revisionHistory: GraphRevisionHistory[];
}

const FILE = path.join(PATHS.data, "knowledge-intelligence.json");

function empty(): StoreData {
	return {
		nodes: [], edges: [], mastery: [], evidence: [], diagnosticSessions: [],
		diagnosticQuestions: [], diagnosticResponses: [], hypotheses: [],
		interventionPlans: [], interventionActivities: [], masteryAssessments: [],
		agentExecutions: [], agentEvaluations: [], validationRecords: [],
		revisionHistory: [],
	};
}

function load(): StoreData {
	try {
		const raw = fs.readFileSync(FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoreData>;
		const base = empty();
		for (const k of Object.keys(base) as (keyof StoreData)[]) {
			(base as any)[k] = (parsed as any)[k] ?? base[k];
		}
		return base;
	} catch {
		return empty();
	}
}

function save(data: StoreData): void {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function now(): string { return new Date().toISOString(); }
function makeId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export const knowledgeIntelligenceStore = {
	// Nodes
	listNodes(): KnowledgeNode[] { return load().nodes; },
	getNode(id: string): KnowledgeNode | null { return load().nodes.find((n) => n.id === id) ?? null; },
	createNode(node: Omit<KnowledgeNode, "id" | "createdAt" | "updatedAt">): KnowledgeNode {
		const data = load();
		const n = { id: makeId("kn"), ...node, createdAt: now(), updatedAt: now() } as KnowledgeNode;
		data.nodes.push(n);
		save(data);
		return n;
	},
	updateNode(id: string, patch: Partial<KnowledgeNode>): KnowledgeNode | null {
		const data = load();
		const idx = data.nodes.findIndex((n) => n.id === id);
		if (idx < 0) return null;
		data.nodes[idx] = { ...data.nodes[idx]!, ...patch, updatedAt: now() } as KnowledgeNode;
		save(data);
		return data.nodes[idx]!;
	},
	deleteNode(id: string): boolean {
		const data = load();
		const before = data.nodes.length;
		data.nodes = data.nodes.filter((n) => n.id !== id);
		data.edges = data.edges.filter((e) => e.source !== id && e.target !== id);
		save(data);
		return data.nodes.length < before;
	},

	// Edges
	listEdges(): KnowledgeEdge[] { return load().edges; },
	createEdge(edge: Omit<KnowledgeEdge, "id" | "createdAt" | "updatedAt">): KnowledgeEdge {
		const data = load();
		const e: KnowledgeEdge = { id: makeId("ke"), ...edge, createdAt: now(), updatedAt: now() };
		data.edges.push(e);
		save(data);
		return e;
	},
	deleteEdge(id: string): boolean {
		const data = load();
		const before = data.edges.length;
		data.edges = data.edges.filter((e) => e.id !== id);
		save(data);
		return data.edges.length < before;
	},

	// Mastery
	listMastery(studentId?: string): StudentConceptMastery[] {
		const data = load();
		return studentId ? data.mastery.filter((m) => m.studentId === studentId) : data.mastery;
	},
	getMastery(studentId: string, conceptId: string): StudentConceptMastery | null {
		return load().mastery.find((m) => m.studentId === studentId && m.conceptId === conceptId) ?? null;
	},
	upsertMastery(m: Omit<StudentConceptMastery, "id" | "updatedAt"> & { id?: string }): StudentConceptMastery {
		const data = load();
		const idx = data.mastery.findIndex((x) => x.studentId === m.studentId && x.conceptId === m.conceptId);
		const rec = { id: m.id ?? makeId("mc"), ...m, updatedAt: now() } as StudentConceptMastery;
		if (idx >= 0) data.mastery[idx] = { ...data.mastery[idx]!, ...rec, id: data.mastery[idx]!.id };
		else data.mastery.push(rec);
		save(data);
		return idx >= 0 ? data.mastery[idx]! : rec;
	},

	// Evidence
	listEvidence(studentId?: string, conceptId?: string): LearningEvidence[] {
		const data = load();
		return data.evidence.filter((e) => (!studentId || e.studentId === studentId) && (!conceptId || e.conceptId === conceptId));
	},
	addEvidence(ev: Omit<LearningEvidence, "id" | "timestamp">): LearningEvidence {
		const data = load();
		const e: LearningEvidence = { id: makeId("ev"), ...ev, timestamp: now() };
		data.evidence.push(e);
		save(data);
		return e;
	},

	// Diagnostic sessions
	listDiagnosticSessions(studentId?: string): DiagnosticSession[] {
		const data = load();
		return studentId ? data.diagnosticSessions.filter((s) => s.studentId === studentId) : data.diagnosticSessions;
	},
	getDiagnosticSession(id: string): DiagnosticSession | null { return load().diagnosticSessions.find((s) => s.id === id) ?? null; },
	createDiagnosticSession(s: Omit<DiagnosticSession, "id" | "createdAt" | "updatedAt">): DiagnosticSession {
		const data = load();
		const rec = { id: makeId("ds"), ...s, createdAt: now(), updatedAt: now() } as DiagnosticSession;
		data.diagnosticSessions.push(rec);
		save(data);
		return rec;
	},
	updateDiagnosticSession(id: string, patch: Partial<DiagnosticSession>): DiagnosticSession | null {
		const data = load();
		const idx = data.diagnosticSessions.findIndex((s) => s.id === id);
		if (idx < 0) return null;
		data.diagnosticSessions[idx] = { ...data.diagnosticSessions[idx]!, ...patch, updatedAt: now() };
		save(data);
		return data.diagnosticSessions[idx]!;
	},

	// Diagnostic questions
	listDiagnosticQuestions(sessionId?: string): DiagnosticQuestion[] {
		const data = load();
		return sessionId ? data.diagnosticQuestions.filter((q) => q.sessionId === sessionId) : data.diagnosticQuestions;
	},
	createDiagnosticQuestion(q: Omit<DiagnosticQuestion, "id" | "generatedAt">): DiagnosticQuestion {
		const data = load();
		const rec: DiagnosticQuestion = { id: makeId("dq"), ...q, generatedAt: now() };
		data.diagnosticQuestions.push(rec);
		save(data);
		return rec;
	},

	// Diagnostic responses
	listDiagnosticResponses(sessionId?: string): DiagnosticResponse[] {
		const data = load();
		return sessionId ? data.diagnosticResponses.filter((r) => r.sessionId === sessionId) : data.diagnosticResponses;
	},
	createDiagnosticResponse(r: Omit<DiagnosticResponse, "id" | "evaluatedAt">): DiagnosticResponse {
		const data = load();
		const rec: DiagnosticResponse = { id: makeId("dr"), ...r, evaluatedAt: now() };
		data.diagnosticResponses.push(rec);
		save(data);
		return rec;
	},

	// Hypotheses
	listHypotheses(sessionId?: string): RootCauseHypothesis[] {
		const data = load();
		return sessionId ? data.hypotheses.filter((h) => h.sessionId === sessionId) : data.hypotheses;
	},
	createHypothesis(h: Omit<RootCauseHypothesis, "id" | "createdAt" | "updatedAt">): RootCauseHypothesis {
		const data = load();
		const rec = { id: makeId("hyp"), ...h, createdAt: now(), updatedAt: now() } as RootCauseHypothesis;
		data.hypotheses.push(rec);
		save(data);
		return rec;
	},
	updateHypothesis(id: string, patch: Partial<RootCauseHypothesis>): RootCauseHypothesis | null {
		const data = load();
		const idx = data.hypotheses.findIndex((h) => h.id === id);
		if (idx < 0) return null;
		data.hypotheses[idx] = { ...data.hypotheses[idx]!, ...patch, updatedAt: now() };
		save(data);
		return data.hypotheses[idx]!;
	},

	// Intervention plans
	listInterventionPlans(studentId?: string): InterventionPlan[] {
		const data = load();
		return studentId ? data.interventionPlans.filter((p) => p.studentId === studentId) : data.interventionPlans;
	},
	createInterventionPlan(p: Omit<InterventionPlan, "id" | "createdAt" | "updatedAt">): InterventionPlan {
		const data = load();
		const rec = { id: makeId("ip"), ...p, createdAt: now(), updatedAt: now() } as InterventionPlan;
		data.interventionPlans.push(rec);
		save(data);
		return rec;
	},
	updateInterventionPlan(id: string, patch: Partial<InterventionPlan>): InterventionPlan | null {
		const data = load();
		const idx = data.interventionPlans.findIndex((p) => p.id === id);
		if (idx < 0) return null;
		data.interventionPlans[idx] = { ...data.interventionPlans[idx]!, ...patch, updatedAt: now() };
		save(data);
		return data.interventionPlans[idx]!;
	},
	listInterventionActivities(planId?: string): InterventionActivity[] {
		const data = load();
		return planId ? data.interventionActivities.filter((a) => a.planId === planId) : data.interventionActivities;
	},
	createInterventionActivity(a: Omit<InterventionActivity, "id">): InterventionActivity {
		const data = load();
		const rec = { id: makeId("ia"), ...a } as InterventionActivity;
		data.interventionActivities.push(rec);
		save(data);
		return rec;
	},
	updateInterventionActivity(id: string, patch: Partial<InterventionActivity>): InterventionActivity | null {
		const data = load();
		const idx = data.interventionActivities.findIndex((a) => a.id === id);
		if (idx < 0) return null;
		data.interventionActivities[idx] = { ...data.interventionActivities[idx]!, ...patch };
		save(data);
		return data.interventionActivities[idx]!;
	},

	// Mastery assessments
	listMasteryAssessments(studentId?: string, conceptId?: string): MasteryAssessment[] {
		const data = load();
		return data.masteryAssessments.filter((a) => (!studentId || a.studentId === studentId) && (!conceptId || a.conceptId === conceptId));
	},
	createMasteryAssessment(a: Omit<MasteryAssessment, "id" | "createdAt">): MasteryAssessment {
		const data = load();
		const rec: MasteryAssessment = { id: makeId("ma"), ...a, createdAt: now() };
		data.masteryAssessments.push(rec);
		save(data);
		return rec;
	},

	// Agent executions
	createAgentExecution(e: Omit<AgentExecution, "id" | "startedAt">): AgentExecution {
		const data = load();
		const rec = { id: makeId("ae"), ...e, startedAt: now() } as AgentExecution;
		data.agentExecutions.push(rec);
		save(data);
		return rec;
	},
	updateAgentExecution(id: string, patch: Partial<AgentExecution>): AgentExecution | null {
		const data = load();
		const idx = data.agentExecutions.findIndex((e) => e.id === id);
		if (idx < 0) return null;
		data.agentExecutions[idx] = { ...data.agentExecutions[idx]!, ...patch };
		save(data);
		return data.agentExecutions[idx]!;
	},

	// Agent evaluations
	listAgentEvaluations(targetId?: string): AgentEvaluation[] {
		const data = load();
		return targetId ? data.agentEvaluations.filter((e) => e.targetId === targetId) : data.agentEvaluations;
	},
	createAgentEvaluation(e: Omit<AgentEvaluation, "id" | "createdAt">): AgentEvaluation {
		const data = load();
		const rec: AgentEvaluation = { id: makeId("eval"), ...e, createdAt: now() };
		data.agentEvaluations.push(rec);
		save(data);
		return rec;
	},

	// Validation records
	createValidationRecord(r: Omit<GraphValidationRecord, "id" | "createdAt">): GraphValidationRecord {
		const data = load();
		const rec: GraphValidationRecord = { id: makeId("gv"), ...r, createdAt: now() };
		data.validationRecords.push(rec);
		save(data);
		return rec;
	},
	listValidationRecords(): GraphValidationRecord[] { return load().validationRecords; },

	// Revision history
	createRevision(r: Omit<GraphRevisionHistory, "id" | "createdAt">): GraphRevisionHistory {
		const data = load();
		const rec: GraphRevisionHistory = { id: makeId("gr"), ...r, createdAt: now() };
		data.revisionHistory.push(rec);
		save(data);
		return rec;
	},
	listRevisions(): GraphRevisionHistory[] { return load().revisionHistory; },
};