// Maps 0G's public model catalog (GET https://router-api.0g.ai/v1/models, no key needed)
// to pi model configs. Kept free of pi imports so it can be tested on its own.

/** One entry of GET /v1/models, the fields this package reads. */
export interface CatalogModel {
	id: string;
	name?: string;
	type?: string;
	context_length?: number;
	max_completion_tokens?: number;
	architecture?: { input_modalities?: string[] };
	supported_parameters?: string[];
	supported_formats?: string[];
	pricing_usd?: { prompt?: string; completion?: string; cached_prompt?: string };
	/**
	 * Measured reasoning controls, published per model once probed (0g-router #1574):
	 * mandatory = reasoning_effort "none" leaves thinking on; efforts = levels that change
	 * how much the model thinks.
	 */
	reasoning?: { mandatory?: boolean; supported_efforts?: string[] };
}

type Level = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
const LEVELS: Level[] = ["minimal", "low", "medium", "high", "xhigh", "max"];

export interface ChatModelConfig {
	id: string;
	name: string;
	reasoning: boolean;
	thinkingLevelMap?: Partial<Record<Level, string | null>>;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}

/** USD per token (as the catalog gives it) to USD per million tokens (as pi wants it). */
function perMillion(v: string | undefined): number {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : 0;
}

/**
 * pi thinking levels for one model.
 *
 * With measured controls: "off" sends reasoning_effort "none" only when that was measured
 * to turn thinking off; otherwise "off" is left unmapped, so pi sends no reasoning_effort
 * and the model thinks as it does by default. When some levels were measured to change how
 * much the model thinks, only those are offered. When none were (the levels all behave
 * alike), pi's default levels stay: any of them gives the model's usual thinking.
 *
 * Without them (not probed yet): pi's defaults, off through high, sent as reasoning_effort
 * values; xhigh and max are not offered.
 */
export function thinkingLevels(m: CatalogModel): ChatModelConfig["thinkingLevelMap"] | undefined {
	const r = m.reasoning;
	if (!r) return undefined;
	const map: Partial<Record<Level, string | null>> = {};
	if (r.mandatory === false) map.off = "none";
	const efforts = new Set(r.supported_efforts ?? []);
	if (efforts.size > 0) for (const lv of LEVELS) map[lv] = efforts.has(lv) ? lv : null;
	return Object.keys(map).length > 0 ? map : undefined;
}

/** Chat models that take OpenAI chat completions, as pi model configs. */
export function toModels(catalog: CatalogModel[]): ChatModelConfig[] {
	const out: ChatModelConfig[] = [];
	for (const m of catalog) {
		if (!m || typeof m.id !== "string" || m.type !== "chatbot") continue;
		if (m.supported_formats && !m.supported_formats.includes("openai")) continue;
		const reasoning = (m.supported_parameters ?? []).includes("reasoning_effort");
		const model: ChatModelConfig = {
			id: m.id,
			name: m.name || m.id,
			reasoning,
			input: (m.architecture?.input_modalities ?? []).includes("image") ? ["text", "image"] : ["text"],
			cost: {
				input: perMillion(m.pricing_usd?.prompt),
				output: perMillion(m.pricing_usd?.completion),
				cacheRead: perMillion(m.pricing_usd?.cached_prompt),
				cacheWrite: 0,
			},
			contextWindow: m.context_length || 128000,
			maxTokens: m.max_completion_tokens || 16384,
		};
		const levels = reasoning ? thinkingLevels(m) : undefined;
		if (levels) model.thinkingLevelMap = levels;
		out.push(model);
	}
	return out.sort((a, b) => a.id.localeCompare(b.id));
}
