// api/parse-identity.js
// Claude's ONLY job in this entire app:
// Take free text like "South Asian woman in my 40s with ADHD"
// Return structured params to query real databases
// No scoring. No ranking. No interpretation. Just extraction.

// This is the only endpoint that spends money (it calls the Anthropic API
// with your own ANTHROPIC_API_KEY) — the rest of the app only calls free,
// unauthenticated public data sources. Two things were wrong here before:
//
// 1. `x-forwarded-for` was read as the FIRST entry in the header. Vercel's
//    edge appends the real client IP as the LAST entry; anything before
//    that can be set by the client itself. Reading the first entry meant
//    anyone could bypass the per-IP limit just by sending their own
//    X-Forwarded-For header.
// 2. There was no cap on total volume across all IPs — a botnet or a lot
//    of distinct visitors could still add up to a large bill even with a
//    correctly-enforced per-IP limit.
//
// Caveat that no in-memory approach fixes: Vercel serverless functions are
// stateless between cold starts and not shared across concurrent instances,
// so this counter can reset or fragment under real traffic. It raises the
// bar significantly but is not a hard guarantee — the actual safety net is
// setting a spend/usage cap on the Anthropic API key itself, in the
// Anthropic console, which no amount of code here can substitute for.
const rateLimitMap = new Map();
const globalRequestLog = [];

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (!forwarded) return "unknown";
  const hops = forwarded.split(",").map(h => h.trim());
  return hops[hops.length - 1] || "unknown"; // last hop = Vercel's own, not client-spoofable
}

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const perIpMax = 10;      // was 30 — tightened
  const globalMax = 150;    // new — hard cap across all IPs combined

  // Global circuit breaker
  while (globalRequestLog.length > 0 && now - globalRequestLog[0] > windowMs) {
    globalRequestLog.shift();
  }
  if (globalRequestLog.length >= globalMax) return true;

  // Per-IP limit
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  if (timestamps.length >= perIpMax) return true;

  // Only record the request once both checks have passed
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  globalRequestLog.push(now);
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = clientIp(req);
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many requests." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "API key not configured." });

  const { identity, condition } = req.body;
  if (!identity) return res.status(400).json({ error: "Identity required" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: `You are a parameter extraction tool. Extract structured data from free text descriptions of people.
Return ONLY valid JSON. No explanation. No scoring. No interpretation. Just extract what is explicitly stated.
If something is not mentioned, use null. Never infer or assume.

The one exception is "suggested_drug": only when asked for it below, you may name a single
well-established, first-line/guideline drug for the given condition — but only when there is
clear, uncontroversial medical consensus on a standard treatment. If the condition has no single
standard drug, multiple equally-common options, or you are not confident, return null. Never
guess an experimental, off-label, or niche drug.`,
        messages: [{
          role: "user",
          content: `Extract structured parameters from this person description: "${identity}"
Condition: "${condition || ""}"

Return JSON only:
{
  "sex": "FEMALE" or "MALE" or "ALL" (use ALL if not specified or if non-binary/trans),
  "min_age": number or null (lower bound of age range mentioned),
  "max_age": number or null (upper bound of age range mentioned),
  "ancestry_keywords": [] (e.g. ["South Asian", "Asian", "Indian", "Pakistani", "Bengali"] — expand to related terms ClinicalTrials would use),
  "condition_keywords": [] (neurodivergent conditions: ["ADHD", "autism", "neurodivergent", "autistic"] etc),
  "diversity_keywords": [] (identity-related search terms for eligibility text: e.g. ["diverse", "minority", "underrepresented", "women", "transgender", "trans", "LGBTQ"]),
  "display_identity": "clean one-line summary of who this person is",
  "suggested_drug": string or null (see system instructions — a single well-established standard drug for "${condition || ""}", only if unambiguous; otherwise null)
}`
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: "Claude API error", detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || "";

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      return res.status(200).json(parsed);
    } catch {
      return res.status(500).json({ error: "Parse failed", raw: text });
    }

  } catch (error) {
    return res.status(500).json({ error: "Internal error", detail: error.message });
  }
};
