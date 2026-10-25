import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	loadCustomProviders,
	saveCustomProvider,
	deleteCustomProvider,
	getSafeCustomProviders,
	validateCustomProviderInput,
	modelCatalog,
} from "../src/server";
import { piModels, piEngineForSpec } from "../src/agent/models.ts";

describe("Custom Providers & Endpoints", () => {
	it("loads pre-seeded custom-pandev provider by default", () => {
		const providers = loadCustomProviders();
		const pandev = providers.find((p) => p.id === "custom-pandev");
		assert.ok(pandev, "custom-pandev must be present in custom providers");
		assert.equal(pandev.name, "pandev");
		assert.equal(pandev.baseUrl, "https://llmrouter.boyemma.com/v1");
		assert.equal(pandev.dialect, "openai-completions");
		assert.ok(pandev.apiKey?.startsWith("sk-"), "apiKey must be present");
		assert.ok(pandev.models.some((m) => m.id === "auto"), "auto model must be present");
	});

	it("projects safe DTO with masked key", () => {
		const safeList = getSafeCustomProviders();
		const pandev = safeList.find((p) => p.id === "custom-pandev");
		assert.ok(pandev, "custom-pandev safe DTO must be present");
		assert.equal(pandev.keySaved, true);
		assert.ok(pandev.maskedKey?.includes("…"), "masked key must have ellipsis");
		// Ensure raw apiKey is never exposed in safe DTO
		assert.equal((pandev as unknown as Record<string, unknown>).apiKey, undefined);
	});

	it("custom provider models appear in modelCatalog()", () => {
		const catalog = modelCatalog();
		const autoModel = catalog.models.find(
			(m) => m.provider === "custom-pandev" && m.id === "auto",
		);
		assert.ok(autoModel, "custom-pandev:auto must be present in modelCatalog()");
		assert.equal(autoModel.provider, "custom-pandev");
		assert.equal(autoModel.id, "auto");
		assert.equal(autoModel.contextWindow, 1000000);
		assert.equal(autoModel.reasoning, true);
	});

	it("creates piEngine for custom model", () => {
		const engine = piEngineForSpec({ provider: "custom-pandev", id: "auto" });
		assert.ok(engine, "engine must be created");
		assert.equal(engine.model.provider, "custom-pandev");
		assert.equal(engine.model.id, "auto");
		assert.equal(typeof engine.streamFn, "function");
	});

	it("validates provider inputs correctly", () => {
		const badId = validateCustomProviderInput({
			id: "bad-id-without-prefix",
			name: "Bad",
			baseUrl: "https://example.com",
			dialect: "openai-completions",
			models: [{ id: "m1", name: "m1", contextWindow: 4096, maxTokens: 2048 }],
		});
		assert.equal(badId.ok, false);
		assert.ok(badId.error.includes("custom-"));

		const good = validateCustomProviderInput({
			id: "custom-test-provider",
			name: "Test Provider",
			baseUrl: "https://api.test.com/v1",
			dialect: "openai-completions",
			noKeyNeeded: true,
			models: [{ id: "test-model", name: "Test Model", contextWindow: 8192, maxTokens: 4096, reasoning: false, acceptsImages: false }],
		});
		assert.equal(good.ok, true);
	});

	it("saves a new custom provider, federates it into pi-ai, and deletes it cleanly", () => {
		const testProvider = {
			id: "custom-temp-test",
			name: "Temp Provider",
			baseUrl: "https://router.temp.com/v1",
			dialect: "openai-completions" as const,
			noKeyNeeded: true,
			models: [
				{
					id: "temp-model",
					name: "Temp Model",
					contextWindow: 128000,
					maxTokens: 4096,
					reasoning: false,
					acceptsImages: true,
				},
			],
		};

		saveCustomProvider(testProvider);

		// Assert model is now in piModels
		const registeredModel = piModels().getModel("custom-temp-test", "temp-model");
		assert.ok(registeredModel, "Model must be registered in piModels()");
		assert.equal(registeredModel.id, "temp-model");

		// Assert in modelCatalog
		const catalogAfterAdd = modelCatalog();
		const inCatalog = catalogAfterAdd.models.find(
			(m) => m.provider === "custom-temp-test" && m.id === "temp-model",
		);
		assert.ok(inCatalog, "Must appear in modelCatalog");

		// Delete and assert removal
		deleteCustomProvider("custom-temp-test");
		const catalogAfterDel = modelCatalog();
		const inCatalogAfterDel = catalogAfterDel.models.find(
			(m) => m.provider === "custom-temp-test",
		);
		assert.equal(inCatalogAfterDel, undefined, "Must be removed from modelCatalog after deletion");
	});
});
