import * as vscode from "vscode";

// Local offline fallback map for Bedrock models
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
	"anthropic.claude-3-5-sonnet-20241022-v2:0": { input: 0.000003, output: 0.000015 },
	"anthropic.claude-3-5-sonnet-20240620-v1:0": { input: 0.000003, output: 0.000015 },
	"anthropic.claude-3-5-haiku-20241022-v1:0": { input: 0.000001, output: 0.000005 },
	"anthropic.claude-3-haiku-20240307-v1:0": { input: 0.00000025, output: 0.00000125 },
	"anthropic.claude-3-sonnet-20240229-v1:0": { input: 0.000003, output: 0.000015 },
	"anthropic.claude-3-opus-20240229-v1:0": { input: 0.000015, output: 0.000075 },
	"amazon.nova-pro-v1:0": { input: 0.0000008, output: 0.0000032 },
	"amazon.nova-sonic-v1:0": { input: 0.0000004, output: 0.0000016 },
	"amazon.nova-lite-v1:0": { input: 0.00000006, output: 0.00000024 },
	"amazon.nova-micro-v1:0": { input: 0.000000035, output: 0.00000014 },
	"meta.llama3-3-70b-instruct-v1:0": { input: 0.00000072, output: 0.00000216 },
	"meta.llama3-1-8b-instruct-v1:0": { input: 0.00000022, output: 0.00000022 },
	"meta.llama3-1-70b-instruct-v1:0": { input: 0.00000072, output: 0.00000072 }
};

export class PricingManager {
	private static readonly CATALOG_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
	private static readonly CACHE_KEY = "bedrock-pricing-catalog";
	private static _catalog: any = null;

	public static async init(globalState: vscode.Memento) {
		// Load from cache first
		const cached = globalState.get<string>(this.CACHE_KEY);
		if (cached) {
			try {
				this._catalog = JSON.parse(cached);
			} catch (e) {
				// Ignore
			}
		}

		// Trigger background fetch to update the catalog
		this.fetchCatalogInBackground(globalState);
	}

	private static async fetchCatalogInBackground(globalState: vscode.Memento) {
		try {
			const res = await fetch(this.CATALOG_URL);
			if (res.ok) {
				const data = await res.json();
				this._catalog = data;
				await globalState.update(this.CACHE_KEY, JSON.stringify(data));
			}
		} catch (e) {
			// Fail silently in background
		}
	}

	public static getPrice(modelId: string): { input: number; output: number } {
		// Clean the modelId: remove cross-region prefixes or region indicators
		// e.g. "us.anthropic.claude-3-5-sonnet-20241022-v2:0" -> "anthropic.claude-3-5-sonnet-20241022-v2:0"
		const cleanId = modelId.replace(/^(us\.|eu\.|ap\.|global\.)/, "");

		if (this._catalog) {
			// Try finding in LiteLLM catalog
			// Keys in LiteLLM might be direct ("anthropic.claude-3-5-sonnet-20241022-v2:0") 
			// or prefixed ("bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0")
			const candidates = [
				cleanId,
				`bedrock/${cleanId}`,
				modelId,
				`bedrock/${modelId}`
			];

			for (const key of candidates) {
				const entry = this._catalog[key];
				if (entry && (entry.input_cost_per_token !== undefined || entry.output_cost_per_token !== undefined)) {
					return {
						input: entry.input_cost_per_token ?? 0,
						output: entry.output_cost_per_token ?? 0
					};
				}
			}
		}

		// Fallback to default local map
		const local = DEFAULT_PRICING[cleanId] || DEFAULT_PRICING[modelId];
		if (local) {
			return local;
		}

		// Absolute fallback (Prompt $0.003 / 1k, Completion $0.015 / 1k)
		return { input: 0.000003, output: 0.000015 };
	}
}
