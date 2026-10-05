export const AI_LIMITS = {
  analysis: Number(process.env.AI_LIMIT_ANALYSIS ?? 5),
  parse: Number(process.env.AI_LIMIT_PARSE ?? 100),
  globalDaily: Number(process.env.AI_GLOBAL_DAILY_LIMIT ?? 300),
};

export const GEMINI = {
  key: process.env.GEMINI_API_KEY ?? "",
  fast: process.env.GEMINI_MODEL_FAST || "gemini-2.5-flash",
  smart: process.env.GEMINI_MODEL_SMART || "gemini-2.5-pro",
};

export const aiConfigured = () => Boolean(GEMINI.key);
