/**
 * Custom providers store adapter: persists custom provider definitions
 * to config.CUSTOM_PROVIDERS_FILE with mode 0600.
 */

import fs from "node:fs";
import path from "node:path";
import { CUSTOM_PROVIDERS_FILE } from "../../config.ts";
import {
	DEFAULT_CUSTOM_PROVIDERS,
	type CustomProviderConfig,
} from "../core/contracts/custom-providers.ts";

let cachedProviders: CustomProviderConfig[] | undefined;

function ensureFileSeeded(): void {
	if (!fs.existsSync(CUSTOM_PROVIDERS_FILE)) {
		writeCustomProviders([...DEFAULT_CUSTOM_PROVIDERS]);
	}
}

export function readCustomProviders(): CustomProviderConfig[] {
	if (cachedProviders) return cachedProviders;
	ensureFileSeeded();
	try {
		const raw = fs.readFileSync(CUSTOM_PROVIDERS_FILE, "utf-8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			cachedProviders = parsed.filter(isValidCustomProvider);
			return cachedProviders;
		}
	} catch {
		// absent or unreadable
	}
	cachedProviders = [...DEFAULT_CUSTOM_PROVIDERS];
	return cachedProviders;
}

export function writeCustomProviders(providers: CustomProviderConfig[]): void {
	cachedProviders = providers;
	const dir = path.dirname(CUSTOM_PROVIDERS_FILE);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = path.join(dir, `.custom-providers.tmp-${process.pid}-${Date.now()}`);
	fs.writeFileSync(tmp, `${JSON.stringify(providers, null, "\t")}\n`, { mode: 0o600 });
	fs.chmodSync(tmp, 0o600);
	fs.renameSync(tmp, CUSTOM_PROVIDERS_FILE);
}

function isValidCustomProvider(p: unknown): p is CustomProviderConfig {
	if (!p || typeof p !== "object" || Array.isArray(p)) return false;
	const obj = p as Record<string, unknown>;
	return (
		typeof obj.id === "string" &&
		obj.id.startsWith("custom-") &&
		typeof obj.name === "string" &&
		typeof obj.baseUrl === "string" &&
		Array.isArray(obj.models)
	);
}
