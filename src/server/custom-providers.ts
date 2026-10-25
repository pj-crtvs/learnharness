import {
	DEFAULT_CUSTOM_PROVIDERS,
	type CustomModelConfig,
	type CustomProviderConfig,
	type SafeCustomProviderDto,
} from "../core/contracts/custom-providers.ts";
import { maskKey } from "../core/auth-keys.ts";
import {
	registerCustomPiProvider,
	removeCustomPiProvider,
	setCustomProviderSource,
} from "../agent/models.ts";
import {
	readCustomProviders,
	writeCustomProviders,
} from "../store/custom-providers.ts";

export { DEFAULT_CUSTOM_PROVIDERS };

export function loadCustomProviders(): CustomProviderConfig[] {
	return readCustomProviders();
}

setCustomProviderSource(() => loadCustomProviders());

export function toSafeCustomProviderDto(provider: CustomProviderConfig): SafeCustomProviderDto {
	const hasKey = Boolean(provider.apiKey && provider.apiKey.trim().length > 0);
	const masked = provider.noKeyNeeded
		? "no key needed"
		: hasKey
			? maskKey(provider.apiKey!)
			: null;
	const { apiKey: _omitted, ...safe } = provider;
	return {
		...safe,
		keySaved: hasKey || provider.noKeyNeeded,
		maskedKey: masked,
	};
}

export function getSafeCustomProviders(): SafeCustomProviderDto[] {
	return loadCustomProviders().map(toSafeCustomProviderDto);
}

export function getCustomProvider(id: string): CustomProviderConfig | undefined {
	return loadCustomProviders().find((p) => p.id === id);
}

export function validateCustomProviderInput(
	input: unknown,
	existingId?: string,
): { ok: true; config: CustomProviderConfig } | { ok: false; error: string } {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return { ok: false, error: "Invalid provider payload: expected object" };
	}
	const obj = input as Record<string, unknown>;
	const id = typeof obj.id === "string" ? obj.id.trim() : "";
	if (!id.startsWith("custom-")) {
		return { ok: false, error: 'Provider ID must start with "custom-"' };
	}
	if (!/^custom-[a-zA-Z0-9_-]+$/.test(id)) {
		return { ok: false, error: "Provider ID can only contain letters, numbers, dashes, and underscores" };
	}

	const name = typeof obj.name === "string" ? obj.name.trim() : "";
	if (!name) {
		return { ok: false, error: "Provider name is required" };
	}

	const baseUrl = typeof obj.baseUrl === "string" ? obj.baseUrl.trim() : "";
	if (!baseUrl) {
		return { ok: false, error: "Base URL is required" };
	}
	try {
		const u = new URL(baseUrl);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			return { ok: false, error: "Base URL must use http: or https:" };
		}
	} catch {
		return { ok: false, error: "Invalid Base URL" };
	}

	const dialect = obj.dialect === "openai-completions" ? "openai-completions" : "openai-completions";
	const noKeyNeeded = Boolean(obj.noKeyNeeded);
	let apiKey: string | undefined = typeof obj.apiKey === "string" ? obj.apiKey.trim() : undefined;

	// If updating and apiKey left blank, retain existing
	if (existingId && (!apiKey || apiKey.length === 0)) {
		const existing = getCustomProvider(existingId);
		if (existing?.apiKey) apiKey = existing.apiKey;
	}

	if (!noKeyNeeded && (!apiKey || apiKey.length === 0)) {
		return { ok: false, error: "API key is required unless 'No API key needed' is checked" };
	}

	if (!Array.isArray(obj.models) || obj.models.length === 0) {
		return { ok: false, error: "At least one model must be configured" };
	}

	const models: CustomModelConfig[] = [];
	for (const m of obj.models) {
		if (!m || typeof m !== "object") {
			return { ok: false, error: "Invalid model specification" };
		}
		const mObj = m as Record<string, unknown>;
		const mId = typeof mObj.id === "string" ? mObj.id.trim() : "";
		if (!mId) return { ok: false, error: "Model ID is required for each model" };
		const mName = typeof mObj.name === "string" && mObj.name.trim() ? mObj.name.trim() : mId;
		const contextWindow = typeof mObj.contextWindow === "number" && mObj.contextWindow > 0 ? mObj.contextWindow : 1000000;
		const maxTokens = typeof mObj.maxTokens === "number" && mObj.maxTokens > 0 ? mObj.maxTokens : 4096;
		const reasoning = Boolean(mObj.reasoning);
		const acceptsImages = Boolean(mObj.acceptsImages);

		let cost: CustomModelConfig["cost"] = undefined;
		if (mObj.cost && typeof mObj.cost === "object") {
			const c = mObj.cost as Record<string, unknown>;
			cost = {
				input: typeof c.input === "number" ? c.input : undefined,
				output: typeof c.output === "number" ? c.output : undefined,
				cacheRead: typeof c.cacheRead === "number" ? c.cacheRead : undefined,
				cacheWrite: typeof c.cacheWrite === "number" ? c.cacheWrite : undefined,
			};
		}

		models.push({
			id: mId,
			name: mName,
			contextWindow,
			maxTokens,
			reasoning,
			acceptsImages,
			cost,
		});
	}

	return {
		ok: true,
		config: {
			id,
			name,
			baseUrl,
			dialect,
			noKeyNeeded,
			apiKey,
			models,
		},
	};
}

export function saveCustomProvider(config: CustomProviderConfig): void {
	const current = loadCustomProviders();
	const existingIdx = current.findIndex((p) => p.id === config.id);
	if (existingIdx >= 0) {
		current[existingIdx] = config;
	} else {
		current.push(config);
	}
	writeCustomProviders(current);
	registerCustomPiProvider(config);
}

export function deleteCustomProvider(id: string): void {
	const current = loadCustomProviders();
	const next = current.filter((p) => p.id !== id);
	writeCustomProviders(next);
	removeCustomPiProvider(id);
}
