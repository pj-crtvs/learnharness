import type { KnowledgeNode, KnowledgeEdge, SourceReference } from "../../core/contracts/knowledge-intelligence.ts";

export interface ProposedGraph {
	nodes: Omit<KnowledgeNode, "id" | "createdAt" | "updatedAt">[];
	edges: Omit<KnowledgeEdge, "id" | "createdAt" | "updatedAt">[];
}

export function proposeGraphFromText(text: string, source: string): ProposedGraph {
	const nodes: ProposedGraph["nodes"] = [];
	const edges: ProposedGraph["edges"] = [];
	const seen = new Set<string>();
	// Heuristic: capitalized phrases of 1-4 words become concept candidates.
	const phraseRegex = /\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3})\b/g;
	let m: RegExpExecArray | null;
	while ((m = phraseRegex.exec(text)) !== null) {
		const name = m[1]!.trim();
		if (name.length < 3) continue;
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const refs: SourceReference[] = [{ id: `src_${nodes.length}`, source, excerpt: name }];
		nodes.push({
			name,
			description: name,
			type: "concept",
			sourceReferences: refs,
			confidence: 0.6,
			verificationStatus: "ai_proposed",
		});
	}
	// Heuristic prerequisite phrases.
	const prereqRegex = /([A-Z][a-zA-Z ]{2,40})\s+(?:requires|depends on|builds on)\s+([A-Z][a-zA-Z ]{2,40})/g;
	let p: RegExpExecArray | null;
	while ((p = prereqRegex.exec(text)) !== null) {
		const src = p[1]!.trim();
		const tgt = p[2]!.trim();
		edges.push({
			source: src,
			target: tgt,
			type: "requires",
			explanation: `${tgt} requires ${src}`,
			confidence: 0.5,
			verified: false,
			aiProposed: true,
		});
	}
	return { nodes, edges };
}

export const knowledgeArchitectAgent = { proposeGraphFromText };