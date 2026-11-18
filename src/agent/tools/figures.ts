import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";

export interface FigureSearchHit {
	id: string;
	documentId: string;
	page: number;
	figureNumber?: string;
	caption?: string;
	chapter?: string;
	section?: string;
	surroundingText?: string;
	concepts: string[];
	imageUrl: string;
}

export interface FigureToolContext {
	searchFigures: (opts: { query: string; documentId?: string; chapter?: string; limit?: number }) => FigureSearchHit[];
}

export const textbookFigureInputSchema = Type.Object({
	query: Type.String({ description: "What the figure should show — concept, physical situation, variables, or question text." }),
	documentId: Type.Optional(Type.String({ description: "Restrict to one uploaded document id. Omit to search all uploaded textbooks." })),
	chapter: Type.Optional(Type.String({ description: "Restrict to a chapter name (substring match)." })),
});

export type TextbookFigureInput = Static<typeof textbookFigureInputSchema>;

function formatFigure(f: FigureSearchHit): string {
	const source = [
		f.chapter ? `CHAPTER: ${f.chapter}` : null,
		f.section ? `SECTION: ${f.section}` : null,
		f.figureNumber ? `FIGURE: ${f.figureNumber}` : null,
		`PAGE: ${f.page}`,
	].filter(Boolean).join("\n");
	const caption = f.caption ? `Caption: ${f.caption}` : "";
	return [
		`![${f.caption ?? f.figureNumber ?? "textbook figure"}](${f.imageUrl})`,
		caption,
		source ? `SOURCE METADATA:\n${source}` : "",
		f.surroundingText ? `Surrounding text: ${f.surroundingText.slice(0, 400)}` : "",
	].filter(Boolean).join("\n");
}

export function textbookFigureTool(ctx: FigureToolContext): AgentTool<typeof textbookFigureInputSchema> {
	return {
		name: "textbook_figure",
		label: "textbook_figure",
		description:
			"Retrieve an actual illustration from an uploaded textbook PDF that matches a concept or problem. " +
			"Use when a visual from the learner's textbook would materially improve understanding or a question. " +
			"Returns the figure image (markdown) plus its source (document, chapter, figure number, page). " +
			"If no sufficiently relevant figure exists, it says so — do not fabricate a source.",
		parameters: textbookFigureInputSchema,
		execute: async (_toolCallId, input) => {
			const hits = ctx.searchFigures({ query: input.query, documentId: input.documentId, chapter: input.chapter, limit: 5 });
			if (!hits || hits.length === 0) {
				return { content: [{ type: "text", text: "No sufficiently relevant textbook figure found. Continue with a text-only explanation or an AI-generated diagram clearly labeled as such." }], details: null };
			}
			const top = hits[0];
			// Simple relevance threshold: require at least one token overlap (search already filters score>0)
			const body = hits.map((h, i) => `### Figure ${i + 1}\n${formatFigure(h)}`).join("\n\n");
			return { content: [{ type: "text", text: `Retrieved ${hits.length} textbook figure(s). Most relevant:\n\n${body}\n\nUse the most relevant figure and cite its source. Label as a related textbook reference if it is not an exact match.` }], details: null };
		},
	};
}

export function figureTools(ctx: FigureToolContext): Record<string, AgentTool<any>> {
	return { textbook_figure: textbookFigureTool(ctx) };
}
