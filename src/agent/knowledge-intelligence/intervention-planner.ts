import type { InterventionPlan, InterventionActivity } from "../../core/contracts/knowledge-intelligence.ts";

export interface InterventionInput {
	studentId: string;
	targetConceptId: string;
	rootCauseConceptId?: string;
	hypothesisConfidence: "low" | "moderate" | "high" | "confirmed";
}

export function planIntervention(input: InterventionInput): Omit<InterventionPlan, "id" | "createdAt" | "updatedAt"> {
	const root = input.rootCauseConceptId ?? input.targetConceptId;
	const activities: InterventionActivity[] = [];
	let order = 0;
	const add = (type: InterventionActivity["type"], conceptId: string, description: string) => {
		activities.push({ id: `ia_${order}`, planId: "pending", type, conceptId, description, order: order++, completed: false });
	};
	add("explanation", root, `Review core explanation of ${root}.`);
	add("conceptual_question", root, `Answer two conceptual questions about ${root}.`);
	add("worked_example", root, `Solve one guided problem involving ${root}.`);
	add("independent_practice", root, `Solve one independent problem involving ${root}.`);
	add("teach_back", root, `Explain ${root} in your own words.`);
	add("independent_practice", input.targetConceptId, `Return to original target concept ${input.targetConceptId}.`);
	return {
		studentId: input.studentId,
		targetConceptId: input.targetConceptId,
		rootCauseConceptId: input.rootCauseConceptId,
		activities,
		status: "proposed",
	};
}