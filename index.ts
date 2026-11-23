// pi provider for 0G (https://pc.0g.ai): every chat model 0G's router serves, read from
// its public catalog, sent as OpenAI chat completions. Set OG_API_KEY to use it.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { type CatalogModel, type ChatModelConfig, toModels } from "./models.ts";

// OG_BASE_URL points it elsewhere, e.g. staging (https://router-api-staging.0g.ai/v1).
const BASE_URL = (process.env.OG_BASE_URL || "https://router-api.0g.ai/v1").replace(/\/+$/, "");
// The catalog is public; a slow or unreachable router must not hold up pi's startup for long.
const CATALOG_TIMEOUT_MS = 10000;
// The last catalog fetched, used when the router cannot be reached at startup.
const CACHE = join(getAgentDir(), "cache", "0g-models.json");

async function fetchModels(signal?: AbortSignal): Promise<ChatModelConfig[]> {
	const timeout = AbortSignal.timeout(CATALOG_TIMEOUT_MS);
	const res = await fetch(`${BASE_URL}/models`, {
		headers: { Accept: "application/json" },
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	});
	if (!res.ok) throw new Error(`GET ${BASE_URL}/models: HTTP ${res.status}`);
	const body = (await res.json()) as { data?: CatalogModel[] };
	if (!Array.isArray(body?.data)) throw new Error(`GET ${BASE_URL}/models: no model list`);
	const models = toModels(body.data);
	try {
		mkdirSync(dirname(CACHE), { recursive: true });
		writeFileSync(`${CACHE}.tmp`, JSON.stringify({ baseUrl: BASE_URL, models }));
		renameSync(`${CACHE}.tmp`, CACHE);
	} catch {
		// a cache that cannot be written only costs the offline fallback
	}
	return models;
}

function cachedModels(): ChatModelConfig[] {
	try {
		const c = JSON.parse(readFileSync(CACHE, "utf8"));
		return c?.baseUrl === BASE_URL && Array.isArray(c.models) ? c.models : [];
	} catch {
		return [];
	}
}

function withCompat(models: ChatModelConfig[]) {
	return models.map((m) => ({
		...m,
		compat: { thinkingFormat: "openai" as const, supportsReasoningEffort: m.reasoning },
	}));
}

export default async function (pi: ExtensionAPI) {
	let models: ChatModelConfig[];
	try {
		models = await fetchModels();
	} catch (err) {
		models = cachedModels();
		console.error(
			`[0g] could not load the model list (${(err as Error).message}); ` +
				(models.length ? `using the last one fetched (${models.length} models)` : "no models until it answers"),
		);
	}
	pi.registerProvider("0g", {
		name: "0G",
		baseUrl: BASE_URL,
		apiKey: "$OG_API_KEY",
		api: "openai-completions",
		headers: { "X-Title": "Pi", "HTTP-Referer": "https://pi.dev" },
		models: withCompat(models),
		async refreshModels(context) {
			return withCompat(await fetchModels(context.signal));
		},
	});
}
