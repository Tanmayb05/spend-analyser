import { MockLanguageModelV4, MockTranscriptionModelV4 } from "ai/test";

/**
 * Offline model for E2E tests and local demos (AI_PROVIDER=mock, never in production).
 * Picks a fixture by looking at the requested JSON schema, so it works for every feature.
 */
const today = () => new Date().toISOString().slice(0, 10);

function fixtureFor(schema: unknown): unknown {
  const props = Object.keys((schema as { properties?: Record<string, unknown> })?.properties ?? {});
  if (props.includes("transactions"))
    return {
      transactions: [
        { date: today(), type: "expense", amount: 12.5, currency: "USD", category: "Food", subcategory: null, merchant: "Mock Cafe", description: "Mock lunch", trip: null, payment_method: null, paid_by: null, notes: null },
      ],
      note: null,
    };
  if (props.includes("items"))
    return {
      merchant: "Mock Market",
      date: today(),
      currency: "USD",
      subtotal: 9,
      tax: 1,
      discount: 0,
      fees: 0,
      total: 10,
      tip: 0,
      tip_source: "none",
      written_total: 0,
      card_last4: null,
      card_brand: "",
      order_type: "in_store",
      order_number: "",
      store_address: "",
      printed_item_count: null,
      items: [
        { raw_name: "MILK 1GAL", normalized_name: "Whole Milk", item_category: "Dairy", quantity: 1, unit: "ea", unit_price: 4, total_price: 4, list_price: null, line_discount: null, upc: null, tax_code: null, is_weighted: false, category: "Food", subcategory: null },
        { raw_name: "BANANAS", normalized_name: "Bananas", item_category: "Produce", quantity: 2, unit: "lb", unit_price: 2.5, total_price: 5, list_price: null, line_discount: null, upc: null, tax_code: null, is_weighted: true, category: "Food", subcategory: null },
      ],
    };
  if (props.includes("headline"))
    return {
      headline: "Mock analysis: spending is steady.",
      summary: "This is a mock result used for testing. No real model was called.",
      insights: [
        { title: "Food is your top category", detail: "Mock detail with a number: $120.", metric: "$120", severity: "watch" },
        { title: "Savings on track", detail: "Mock detail: income exceeded spend by 20%.", metric: "+20%", severity: "good" },
      ],
      actions: ["Mock action: review subscriptions."],
    };
  // "Groceries › Groceries" exists in the default categories every new account gets
  if (props.includes("categorized")) return { categorized: [{ i: 0, category: "Groceries", subcategory: "Groceries", confidence: "high" }] };
  if (props.includes("merchant_fixes")) return { merchant_fixes: [] };
  if (props.includes("item_names")) return { item_names: [{ i: 0, normalized_name: "Whole Milk", item_category: "Dairy" }] };
  if (props.includes("explanations")) return { explanations: [{ i: 0, flag: true, reason: "Mock: same amount at the same merchant two days apart." }] };
  return {};
}

export function mockModel() {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock",
    doGenerate: async (options) => {
      const schema = options.responseFormat?.type === "json" ? options.responseFormat.schema : undefined;
      // free-text (Q&A) calls have no schema: answer without calling tools
      const text = schema ? JSON.stringify(fixtureFor(schema)) : "Mock answer: you spent $120 on Food last month.";
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

/** What the mock "hears" for any recording. It parses cleanly through the mock text model too. */
export const MOCK_TRANSCRIPT = "12.50 Mock Cafe lunch";

export function mockTranscriptionModel() {
  return new MockTranscriptionModelV4({
    provider: "mock",
    modelId: "mock-transcribe",
    doGenerate: async () => ({
      text: MOCK_TRANSCRIPT,
      segments: [],
      language: "en",
      durationInSeconds: undefined,
      warnings: [],
      response: { timestamp: new Date(), modelId: "mock-transcribe", headers: {} },
    }),
  });
}
