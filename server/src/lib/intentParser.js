/**
 * Intent parser — converts natural language buyer intent into structured backend-safe data
 * LLM may polish, but deterministic parsing is the source of truth for financial values
 */

export function parseIntentDeterministic(text) {
  const lower = text.toLowerCase();
  const result = {
    raw: text,
    category: null,
    maxPrice: null,
    targetMonthly: null,
    maxTenor: null,
    keywords: [],
  };

  // Category detection
  if (lower.match(/laptop|macbook|thinkpad|dell/)) result.category = "laptop";
  else if (lower.match(/phone|iphone|galaxy|pixel|samsung/)) result.category = "phone";
  else if (lower.match(/tablet|ipad/)) result.category = "tablet";
  else if (lower.match(/headphone|sony|audio|earphone/)) result.category = "audio";

  // Price extraction — "around ₹60,000" / "below ₹65,000" / "60k"
  const priceMatch = lower.match(/(?:around|below|under|less than|upto|up to)?\s*₹?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*(k)?/);
  if (priceMatch) {
    let val = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (priceMatch[2] === "k") val *= 1000;
    if (val >= 5000 && val <= 200000) {
      if (lower.includes("below") || lower.includes("under") || lower.includes("less than")) {
        result.maxPrice = val;
      } else if (lower.includes("around")) {
        result.maxPrice = Math.round(val * 1.1);
      } else {
        result.maxPrice = val;
      }
    }
  }

  // Monthly budget extraction — "₹4,000 a month" / "4000 per month" / "monthly ₹5000"
  const monthlyMatch = lower.match(/(?:₹?\s*(\d{1,3}(?:,\d{3})*|\d+)\s*(?:a month|per month|monthly|month))/);
  if (monthlyMatch) {
    const val = parseInt(monthlyMatch[1].replace(/,/g, ""), 10);
    if (val >= 500 && val <= 50000) result.targetMonthly = val;
  } else {
    // Alternative: "spend around ₹4,000" in context of monthly
    const spendMatch = lower.match(/spend.*?₹?\s*(\d{1,3}(?:,\d{3})*)\s*(?:a month|per month)/);
    if (spendMatch) {
      const val = parseInt(spendMatch[1].replace(/,/g, ""), 10);
      if (val >= 500 && val <= 50000) result.targetMonthly = val;
    }
  }

  // Tenor extraction — "within a year" / "12 months" / "pay off in 6 months"
  if (lower.match(/within a year|12 months|one year/)) result.maxTenor = 12;
  else if (lower.match(/within 6 months|6 months/)) result.maxTenor = 6;
  else if (lower.match(/within 18 months|18 months/)) result.maxTenor = 18;
  else if (lower.match(/within 24 months|24 months|2 years/)) result.maxTenor = 24;
  else {
    const tenorMatch = lower.match(/(\d+)\s*months/);
    if (tenorMatch) {
      const val = parseInt(tenorMatch[1], 10);
      if ([3, 6, 9, 12, 18, 24].includes(val)) result.maxTenor = val;
    }
  }

  // Keywords
  if (lower.includes("affordable") || lower.includes("comfortably")) result.keywords.push("affordable");
  if (lower.includes("fast") || lower.includes("quick") || lower.includes("soon")) result.keywords.push("fast_payoff");
  if (lower.includes("low interest") || lower.includes("least interest")) result.keywords.push("low_interest");

  return result;
}

export async function parseIntentWithLLM(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const deterministic = parseIntentDeterministic(text);
  
  if (!apiKey) return deterministic;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 400,
        system: "You are an intent parser for a commerce agent. Extract structured JSON from buyer intent. Return ONLY JSON with keys: category (laptop/phone/tablet/audio or null), maxPrice (number or null), targetMonthly (number or null), maxTenor (number or null). Never invent values. Use only numbers explicitly mentioned. Category must be one of those 4 or null.",
        messages: [{ role: "user", content: `Parse: "${text}"` }],
      }),
    });
    if (!res.ok) return deterministic;
    const data = await res.json();
    const content = data.content?.[0]?.text || "";
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const llmParsed = JSON.parse(jsonMatch[0]);
      // Merge — LLM may catch what deterministic missed, but deterministic values take precedence if LLM hallucinates
      return {
        ...deterministic,
        category: llmParsed.category || deterministic.category,
        maxPrice: llmParsed.maxPrice || deterministic.maxPrice,
        targetMonthly: llmParsed.targetMonthly || deterministic.targetMonthly,
        maxTenor: llmParsed.maxTenor || deterministic.maxTenor,
        llmEnhanced: true,
      };
    }
  } catch (e) {
    console.warn("[intentParser] LLM failed", e.message);
  }
  return deterministic;
}
