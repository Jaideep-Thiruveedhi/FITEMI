/**
 * llmAdvisor.js — AI layer with exactly two exported functions.
 * All LLM provider calls are isolated in this file.
 * Reads ANTHROPIC_API_KEY from environment; gracefully falls back to deterministic text if unavailable.
 */

// --- Internal: shared Claude API caller ---

async function callClaude(prompt, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null; // signal fallback
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[llmAdvisor] Claude API error ${res.status}: ${errBody}`);
      console.warn(`[LLM_FALLBACK] Anthropic API non-2xx (${res.status}) — using deterministic explanation`);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      console.warn(`[LLM_FALLBACK] Claude returned empty content — using deterministic explanation`);
      return null;
    }
    return text;
  } catch (err) {
    clearTimeout(timeout);
    const reason = err.name === "AbortError" ? "timeout (8s)" : err.message;
    console.warn("[llmAdvisor] Claude API call failed:", reason);
    console.warn(`[LLM_FALLBACK] Claude call failed (${reason}) — using deterministic explanation`);
    return null;
  }
}

// --- Fallback explainers (deterministic, used when LLM unavailable) ---

function fallbackExplanation(options, inputs) {
  if (!options.feasible) {
    return (
      `We checked every available lender and tenure (3–24 months) for an item priced at \u20B9${inputs.itemPrice} ` +
      `against your monthly budget of \u20B9${inputs.targetMonthlyPayment}. ` +
      `Even the longest plan available would require more per month than you can spare. ` +
      `This means no responsible EMI plan fits right now — taking one would risk missed payments. ` +
      `Consider a lower-priced item, a larger down payment, or revisiting once your monthly buffer increases.`
    );
  }

  const opts = options.options;
  const best = opts[0];
  let text =
    `For \u20B9${inputs.itemPrice} with a monthly budget of \u20B9${inputs.targetMonthlyPayment}, ` +
    `we found ${opts.length} plan(s) that fit. ` +
    `The best option is ${best.tenorMonths} months at \u20B9${best.emi}/month ` +
    `(total interest \u20B9${best.totalInterest}) via ${best.lenderId} — ` +
    `it's the shortest tenure that stays within your budget, so you pay the least interest overall.`;

  if (opts.length > 1) {
    const others = opts.slice(1).map((o) => `${o.tenorMonths}m at \u20B9${o.emi}/mo (\u20B9${o.totalInterest} interest, ${o.lenderId})`).join("; ");
    text += ` Alternatives: ${others}.`;
  }

  text += ` All EMIs were computed deterministically; no AI-generated numbers are shown here.`;
  return text;
}

// --- Exported: explainRecommendation ---

/**
 * Produce a short, plain-language explanation of the solver's result.
 * Prose only — never invents or changes a number.
 *
 * @param {{ feasible: boolean, options?: Array, reason?: string }} solverResult
 * @param {{ itemPrice: number, targetMonthlyPayment: number, affordabilityCeiling?: number }} inputs
 * @returns {Promise<string>}
 */
export async function explainRecommendation(solverResult, inputs) {
  const systemPrompt =
    "You are a helpful, concise financial explainer for an EMI checkout agent. " +
    "You explain EMI recommendations in plain, friendly language. " +
    "CRITICAL RULE: You must NEVER invent, change, or hallucinate any numeric value (tenor, EMI, interest, price). " +
    "Only use the exact numbers provided in the prompt. If no feasible plan exists, explain why clearly and suggest next steps without pushing a loan. " +
    "Keep your response under 150 words. Use Indian Rupee (\u20B9) formatting.";

  let prompt;
  if (!solverResult.feasible) {
    prompt =
      `The solver found NO feasible EMI plan.\n` +
      `Inputs: item price \u20B9${inputs.itemPrice}, monthly budget \u20B9${inputs.targetMonthlyPayment}` +
      `${inputs.affordabilityCeiling != null ? `, affordability ceiling \u20B9${inputs.affordabilityCeiling}` : ""}.\n` +
      `Reason from solver: ${solverResult.reason}\n` +
      `Explain in plain language why no plan works and what the buyer could do next. Do not suggest any specific EMI numbers.`;
  } else {
    const optsDesc = solverResult.options
      .map((o) => `- ${o.lenderId}: ${o.tenorMonths} months, EMI \u20B9${o.emi}, total interest \u20B9${o.totalInterest}, total paid \u20B9${o.totalPaid}`)
      .join("\n");
    prompt =
      `The solver found these ranked EMI options (ranked by lowest total interest):\n` +
      `${optsDesc}\n` +
      `Inputs: item price \u20B9${inputs.itemPrice}, monthly budget \u20B9${inputs.targetMonthlyPayment}` +
      `${inputs.affordabilityCeiling != null ? `, affordability ceiling \u20B9${inputs.affordabilityCeiling}` : ""}.\n` +
      `Explain why the top option is best (shortest tenure within budget = least interest) and briefly mention alternatives. ` +
      `Use ONLY the numbers above. Do not add or change any figures.`;
  }

  const llmText = await callClaude(prompt, systemPrompt);
  if (llmText) return llmText.trim();
  // Explicit testable fallback path — deterministic explanation, visible in demo
  console.log(`[LLM_FALLBACK] explainRecommendation fallback for itemPrice=${inputs.itemPrice} feasible=${solverResult.feasible}`);
  return fallbackExplanation(solverResult, inputs);
}

// --- Exported: askAffordabilityQuestions ---

/**
 * For buyers who don't know their budget, drive a short Q&A to collect
 * income/obligation data. This function gathers input; it never decides a tenor/EMI.
 *
 * @param {Array<{ role: string, content: string }>} conversationSoFar
 * @returns {Promise<{ nextQuestion: string | null, isComplete: boolean, collected?: object, affordabilityCeiling?: number, message?: string }>}
 */
export async function askAffordabilityQuestions(conversationSoFar) {
  const systemPrompt =
    "You are a friendly affordability assistant for an EMI checkout. " +
    "Your ONLY job is to ask short, clear questions to collect: (1) monthly take-home pay, (2) existing EMIs/rent/obligations, (3) other big recurring expenses. " +
    "Ask ONE question at a time. Be warm and concise. " +
    "You NEVER recommend a loan tenor, EMI amount, or interest figure — you only collect info. " +
    "If the user has already provided takeHomePay and existingObligations, acknowledge you have enough and say you'll compute their safe budget.";

  // Simple deterministic state machine as primary logic; LLM refines wording if available
  const collected = extractAffordabilityData(conversationSoFar);

  // Determine next missing field
  let nextField = null;
  if (collected.takeHomePay == null) nextField = "takeHomePay";
  else if (collected.existingObligations == null) nextField = "existingObligations";
  else if (collected.otherExpenses == null) nextField = "otherExpenses";

  if (nextField === null) {
    // All collected — compute ceiling deterministically
    const { computeAffordabilityCeiling } = await import("./affordability.js");
    const ceiling = computeAffordabilityCeiling(collected);
    return {
      isComplete: true,
      collected,
      affordabilityCeiling: ceiling,
      nextQuestion: null,
      message: `Thanks! Based on your take-home of \u20B9${collected.takeHomePay} and existing obligations of \u20B9${collected.existingObligations}, your safe monthly budget is \u20B9${ceiling}. We'll now find EMI plans that fit within this.`,
    };
  }

  const fieldQuestions = {
    takeHomePay: "What is your monthly take-home pay (after taxes)?",
    existingObligations: "How much do you already pay each month toward existing EMIs, rent, or other fixed obligations?",
    otherExpenses: "Roughly how much goes to other big recurring expenses (groceries, utilities, etc.) each month? (You can say 0 if unsure)",
  };

  const rawQuestion = fieldQuestions[nextField];

  // Try to get a more natural phrasing from LLM
  const historyText = conversationSoFar.map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt =
    `Conversation so far:\n${historyText || "(no messages yet)"}\n\n` +
    `Next info needed: ${nextField}. ` +
    `Rephrase this question naturally and warmly in one sentence: "${rawQuestion}" ` +
    `Just return the single question, nothing else.`;

  const llmQuestion = await callClaude(prompt, systemPrompt);
  if (!llmQuestion) {
    console.log(`[LLM_FALLBACK] askAffordabilityQuestions fallback for ${nextField}`);
  }
  return {
    isComplete: false,
    collected,
    nextQuestion: llmQuestion ? llmQuestion.trim() : rawQuestion,
  };
}

/**
 * Extract numeric affordability data from conversation messages.
 */
function extractAffordabilityData(messages) {
  const result = { takeHomePay: null, existingObligations: null, otherExpenses: null };

  // Look for explicit structured data first (e.g. { takeHomePay: 50000 })
  for (const msg of messages) {
    if (msg.data && typeof msg.data === "object") {
      if (msg.data.takeHomePay != null) result.takeHomePay = Number(msg.data.takeHomePay);
      if (msg.data.existingObligations != null) result.existingObligations = Number(msg.data.existingObligations);
      if (msg.data.otherExpenses != null) result.otherExpenses = Number(msg.data.otherExpenses);
    }
    // Try to parse numbers from free text in order
    if (msg.role === "user" && typeof msg.content === "string") {
      const nums = msg.content.match(/[\d,]+/g);
      // Only auto-extract if not already set via structured data and message is simple numeric
      // We rely primarily on structured data; free-text extraction is best-effort
    }
  }

  // Also check for user messages that are plain numbers (sequential Q&A)
  const userMessages = messages.filter((m) => m.role === "user");
  let idx = 0;
  for (const um of userMessages) {
    if (um.data) continue; // already handled
    const val = parseInt(String(um.content).replace(/[,₹\s]/g, ""), 10);
    if (!isNaN(val) && val >= 0) {
      if (result.takeHomePay == null) result.takeHomePay = val;
      else if (result.existingObligations == null) result.existingObligations = val;
      else if (result.otherExpenses == null) result.otherExpenses = val;
    }
  }

  return result;
}
