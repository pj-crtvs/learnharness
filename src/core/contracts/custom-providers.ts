/**
 * Custom provider contracts (custom-endpoints wave): types and DTOs for user-defined
 * OpenAI-compatible model providers (e.g. self-hosted, proxies, or router endpoints).
 */

export interface CustomModelCost {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
}

export interface CustomModelConfig {
	id: string;
	name: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	acceptsImages: boolean;
	cost?: CustomModelCost;
}

export type CustomProviderDialect = "openai-completions";

export interface CustomProviderConfig {
	id: string; // e.g. "custom-pandev", must start with "custom-"
	name: string;
	baseUrl: string;
	dialect: CustomProviderDialect;
	noKeyNeeded: boolean;
	apiKey?: string;
	models: CustomModelConfig[];
}

export interface SafeCustomProviderDto extends Omit<CustomProviderConfig, "apiKey"> {
	keySaved: boolean;
	maskedKey: string | null;
}

export const DEFAULT_CUSTOM_PROVIDERS: readonly CustomProviderConfig[] = [
	{
		id: "custom-pandev",
		name: "pandev",
		baseUrl: "https://llmrouter.boyemma.com/v1",
		dialect: "openai-completions",
		noKeyNeeded: false,
		apiKey: "sk-Y_I9r7GUE-kJ5ir_e6v7Fg",
		models: [
			{
				id: "auto",
				name: "auto",
				contextWindow: 1000000,
				maxTokens: 16384,
				reasoning: true,
				acceptsImages: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
			{
				id: "flash",
				name: "flash",
				contextWindow: 256000,
				maxTokens: 16384,
				reasoning: true,
				acceptsImages: true,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
		],
	},
];
