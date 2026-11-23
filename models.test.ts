import assert from "node:assert/strict";
import { test } from "node:test";
import { thinkingLevels, toModels } from "./models.ts";

const base = {
	type: "chatbot",
	context_length: 1000000,
	max_completion_tokens: 128000,
	supported_parameters: ["tools", "reasoning_effort"],
	supported_formats: ["openai"],
	pricing_usd: { prompt: "0.000005", completion: "0.00003" },
};

test("maps a catalog entry", () => {
	const [m] = toModels([
		{ ...base, id: "gpt-5.5", name: "GPT-5.5", architecture: { input_modalities: ["text", "image"] } },
	]);
	assert.deepEqual(m, {
		id: "gpt-5.5",
		name: "GPT-5.5",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 5, output: 30, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 128000,
	});
});

test("keeps only chat models that take chat completions", () => {
	const got = toModels([
		{ ...base, id: "b" },
		{ ...base, id: "a" },
		{ ...base, id: "emb", type: "embedding" },
		{ ...base, id: "msgs-only", supported_formats: ["anthropic"] },
		{ ...base, id: "no-formats", supported_formats: undefined },
	]).map((m) => m.id);
	assert.deepEqual(got, ["a", "b", "no-formats"]);
});

test("no reasoning_effort: not a reasoning model, no levels", () => {
	const [m] = toModels([
		{ ...base, id: "x", supported_parameters: ["tools"], reasoning: { mandatory: false, supported_efforts: ["low"] } },
	]);
	assert.equal(m.reasoning, false);
	assert.equal(m.thinkingLevelMap, undefined);
});

test("cached prompt price and missing prices", () => {
	const [m] = toModels([
		{ ...base, id: "x", pricing_usd: { prompt: "0.0000014", completion: "bad", cached_prompt: "0.00000002666666666667" } },
	]);
	assert.deepEqual(m.cost, { input: 1.4, output: 0, cacheRead: 0.026667, cacheWrite: 0 });
});

test("thinking levels from measured controls", () => {
	// not probed yet: pi's defaults
	assert.equal(thinkingLevels({ id: "x" }), undefined);
	// gpt-5.5 (11-18): none turns thinking off; low, medium, xhigh take effect
	assert.deepEqual(thinkingLevels({ id: "x", reasoning: { mandatory: false, supported_efforts: ["low", "medium", "xhigh"] } }), {
		off: "none",
		minimal: null,
		low: "low",
		medium: "medium",
		high: null,
		xhigh: "xhigh",
		max: null,
	});
	// glm-5.3 (11-18): none does not turn it off: "off" sends nothing
	const glm = thinkingLevels({ id: "x", reasoning: { mandatory: true, supported_efforts: ["low", "high", "max"] } });
	assert.equal(glm?.off, undefined);
	assert.deepEqual([glm?.low, glm?.medium, glm?.high, glm?.max], ["low", null, "high", "max"]);
	// qwen3.8-max (11-18): none turns it off, levels all alike: the default levels stay
	assert.deepEqual(thinkingLevels({ id: "x", reasoning: { mandatory: false, supported_efforts: [] } }), { off: "none" });
	// minimax-m3 (11-18): cannot be turned off, levels alike: nothing to change
	assert.equal(thinkingLevels({ id: "x", reasoning: { mandatory: true, supported_efforts: [] } }), undefined);
});
