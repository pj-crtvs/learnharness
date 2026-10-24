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
