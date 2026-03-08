// api/parse-identity.js
// Claude's ONLY job in this entire app:
// Take free text like "South Asian woman in my 40s with ADHD"
// Return structured params to query real databases
// No scoring. No ranking. No interpretation. Just extraction.

const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 30;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return timestamps.length > max;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
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
If something is not mentioned, use null. Never infer or assume.`,
        messages: [{
          role: "user",
          content: `Extract structured parameters from this person description: "${identity}"

Return JSON only:
{
  "sex": "FEMALE" or "MALE" or "ALL" (use ALL if not specified or if non-binary/trans),
  "min_age": number or null (lower bound of age range mentioned),
  "max_age": number or null (upper bound of age range mentioned),
  "ancestry_keywords": [] (e.g. ["South Asian", "Asian", "Indian", "Pakistani", "Bengali"] — expand to related terms ClinicalTrials would use),
  "condition_keywords": [] (neurodivergent conditions: ["ADHD", "autism", "neurodivergent", "autistic"] etc),
  "diversity_keywords": [] (identity-related search terms for eligibility text: e.g. ["diverse", "minority", "underrepresented", "women", "transgender", "trans", "LGBTQ"]),
  "display_identity": "clean one-line summary of who this person is"
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
