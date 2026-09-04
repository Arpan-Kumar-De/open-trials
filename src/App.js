import { useState, useEffect, useCallback } from "react";

// ── API calls ─────────────────────────────────────────────────────

async function parseIdentity(identity, condition) {
  const res = await fetch("/api/parse-identity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, condition }),
  });
  if (!res.ok) throw new Error("Identity parsing failed");
  return res.json();
}

async function fetchPharmGKB(drug, condition, ancestry_keywords) {
  const res = await fetch("/api/pharmgkb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drug, condition, ancestry_keywords }),
  });
  if (!res.ok) throw new Error("PharmGKB fetch failed");
  return res.json();
}

async function fetchTrials(condition, params) {
  const res = await fetch("/api/trials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ condition, ...params }),
  });
  if (!res.ok) throw new Error("Trials fetch failed");
  return res.json();
}

// ── Design tokens ─────────────────────────────────────────────────
// Two accents, each meaning exactly one thing:
//   --data  = "this is real, verified data" (source badges, links, primary action)
//   --match = "this is about you specifically" (personalized matches)
// Status colors (danger/warning/success) are reserved for system state only —
// never reused to encode data meaning like evidence level or match strength.
const TOKENS = `
  :root {
    --bg: #f7f6f3;
    --surface: #ffffff;
    --border: #e4e2dc;
    --text: #1c1b18;
    --text-muted: #6b6a63;
    --text-faint: #928f86;
    --data: #0d6e6e;
    --data-soft: #0d6e6e14;
    --data-border: #0d6e6e40;
    --match: #a1580a;
    --match-soft: #a1580a14;
    --match-border: #a1580a3d;
    --danger: #b3261e;
    --danger-soft: #fdecea;
    --danger-border: #f3c6c2;
    --warning: #8a6a00;
    --warning-soft: #fdf6df;
    --warning-border: #edda9c;
    --success: #1e6b3e;
    --success-soft: #e8f5ec;
    --radius: 10px;
    --fs-1: 12px;
    --fs-2: 14px;
    --fs-3: 16px;
    --fs-4: 20px;
    --fs-5: 28px;
    --fs-6: 40px;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to { transform: rotate(360deg); } }
  input:focus, textarea:focus, button:focus-visible {
    outline: none !important;
    box-shadow: 0 0 0 2px var(--data) !important;
    border-color: var(--data) !important;
  }
  .trial-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.10) !important; }
  a { color: var(--data); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

// ── Icons (no emoji anywhere — plain monoline SVG) ──────────────────

const Icon = ({ name, size = 16, color = "currentColor" }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "check":
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case "alert":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={color} stroke="none" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="7.5" r="0.6" fill={color} stroke="none" /></svg>;
    case "chevronDown":
      return <svg {...common}><polyline points="6 9 12 15 18 9" /></svg>;
    case "chevronUp":
      return <svg {...common}><polyline points="18 15 12 9 6 15" /></svg>;
    case "link":
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>;
    case "flask":
      return <svg {...common}><path d="M9 2h6" /><path d="M10 2v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3.5L14 8V2" /></svg>;
    case "bars":
      return <svg {...common}><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="6" /><line x1="18" y1="20" x2="18" y2="15" /></svg>;
    case "clipboard":
      return <svg {...common}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="15" y2="15" /></svg>;
    case "molecule":
      return <svg {...common}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="17" r="2.5" /><line x1="8" y1="7" x2="10.5" y2="15" /><line x1="16" y1="7" x2="13.5" y2="15" /></svg>;
    case "spinner":
      return <svg {...common} style={{ animation: "spin 0.9s linear infinite" }}><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
    default:
      return null;
  }
};

// ── UI Components ─────────────────────────────────────────────────

const Card = ({ children, style = {} }) => (
  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, ...style }}>{children}</div>
);

// One label component, three variants — replaces the old Chip/Tag/DataLabel sprawl.
const Pill = ({ children, variant = "neutral", small }) => {
  const styles = {
    neutral: { background: "#f1f0ec", color: "var(--text-muted)" },
    data: { background: "var(--data-soft)", color: "var(--data)" },
    match: { background: "var(--match-soft)", color: "var(--match)" },
    danger: { background: "var(--danger-soft)", color: "var(--danger)" },
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      borderRadius: 14, padding: small ? "2px 8px" : "4px 10px",
      fontSize: small ? 11 : var_fs1(), fontWeight: 500,
      marginRight: 6, marginBottom: 6, ...styles[variant],
    }}>{children}</span>
  );
};
function var_fs1() { return 12; }

const Banner = ({ kind, children }) => {
  const map = {
    warning: { bg: "var(--warning-soft)", border: "var(--warning-border)", color: "var(--warning)", icon: "info" },
    danger: { bg: "var(--danger-soft)", border: "var(--danger-border)", color: "var(--danger)", icon: "alert" },
    info: { bg: "var(--data-soft)", border: "var(--data-border)", color: "var(--data)", icon: "info" },
  };
  const s = map[kind];
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: 12, fontSize: 13, color: s.color, marginBottom: 16, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name={s.icon} size={15} /></span>
      <span>{children}</span>
    </div>
  );
};

const SectionHeader = ({ icon, title, subtitle }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--data-soft)", color: "var(--data)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={17} />
    </div>
    <div>
      <div style={{ fontSize: "var(--fs-4)", fontWeight: 600, color: "var(--text)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>
);

const LoadingRow = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--text-muted)" }}>
    <Icon name="spinner" size={16} color="var(--data)" />
    <span style={{ fontSize: 13 }}>{label}</span>
  </div>
);

// Fixed: the "matches you" state is carried entirely by fill color, never by
// a full-width border — a border on the outer track (the old bug) made a 0%
// match look as prominent as a 36% one. The bar width is always honest.
const ProgressBar = ({ value, matches }) => (
  <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: matches ? "var(--match)" : "var(--data)", borderRadius: 4, transition: "width 0.6s ease" }} />
  </div>
);

// ── Verdict synthesis ────────────────────────────────────────────
// Not a fabricated composite score — that would violate the app's own
// "no scoring" premise. Just the three real facts, stated in plain language
// together, instead of leaving the user to synthesize three raw data dumps.
// Clinical trial phases are meaningless without context — "Phase 2" tells a
// layperson nothing about how far along or how risky a trial is.
function formatPhase(raw) {
  if (!raw || raw === "Not specified") return null;
  return raw.split(", ").map(p => p.replace("PHASE", "Phase ").replace("NA", "N/A")).join(", ");
}
function phaseGloss(raw) {
  if (!raw) return null;
  const p = raw.toUpperCase();
  if (p.includes("PHASE1") && !p.includes("PHASE2")) return "earliest-stage safety testing";
  if (p.includes("PHASE2") && !p.includes("PHASE3")) return "mid-stage testing";
  if (p.includes("PHASE3")) return "late-stage testing, close to approval";
  if (p.includes("PHASE4")) return "approved drug, monitored after release";
  return null;
}

function buildVerdictFacts({ pharm, trials }) {
  const facts = [];
  const div = trials?.diversity;
  const rec = trials?.recruiting;
  const matchedGroup = div?.stats?.groups?.find(g => g.matches_user);

  if (div?.fetch_error) {
    facts.push({ text: "Couldn't load completed-trial demographic data — request failed, not \"no data.\"", tone: "danger" });
  } else if (matchedGroup) {
    facts.push({ text: `Your ancestry group made up ${matchedGroup.percentage}% of ${div.stats.total_participants_counted.toLocaleString()} participants across ${div.stats.trials_with_demographics} completed trials for this condition.`, tone: matchedGroup.percentage >= 15 ? "data" : "match" });
  } else if (div && div.data_available === false) {
    facts.push({ text: "No completed trials for this condition report demographic breakdowns at all — a gap in the data itself.", tone: "match" });
  }

  const ancestryRep = pharm?.ancestry_representation;
  if (pharm?.fetch_errors?.length > 0 && !pharm?.data_found) {
    facts.push({ text: "Couldn't load PharmGKB/CPIC data — request failed, not \"no data.\"", tone: "danger" });
  } else if (ancestryRep?.percentage !== null && ancestryRep?.percentage !== undefined) {
    facts.push({ text: `${ancestryRep.percentage}% of genetic studies on ${pharm.search_term} included your ancestry group.`, tone: ancestryRep.percentage >= 15 ? "data" : "match" });
  }

  if (rec?.fetch_error) {
    facts.push({ text: "Couldn't load recruiting-trial data — request failed, not \"zero trials.\"", tone: "danger" });
  } else {
    const n = rec?.trials?.length ?? 0;
    facts.push({ text: `${n} recruiting ${n === 1 ? "trial" : "trials"} worldwide currently match your sex and age.`, tone: "data" });
  }

  return facts;
}

// ── Main App ──────────────────────────────────────────────────────

const EXAMPLE = { identity: "Nigerian woman in her 30s", condition: "Lupus", drug: "" };

export default function OpenDrugTrials() {
  const [condition, setCondition] = useState("");
  const [drug, setDrug] = useState("");
  const [identity, setIdentity] = useState("");
  const [stage, setStage] = useState("input"); // input | parsing | fetching | done
  const [parsed, setParsed] = useState(null);
  const [pharmData, setPharmData] = useState(null);
  const [trialData, setTrialData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedTrial, setExpandedTrial] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function reset() {
    setStage("input"); setParsed(null); setPharmData(null);
    setTrialData(null); setError(null); setExpandedTrial(null); setLinkCopied(false);
  }

  const analyse = useCallback(async (overrides) => {
    const useCondition = overrides?.condition ?? condition;
    const useIdentity = overrides?.identity ?? identity;
    const useDrug = overrides?.drug ?? drug;
    if (!useCondition.trim() || !useIdentity.trim()) return;
    setStage("parsing"); setParsed(null); setPharmData(null); setTrialData(null); setError(null);

    try {
      const identityParams = await parseIdentity(useIdentity, useCondition);
      setParsed(identityParams);
      setStage("fetching");

      const userDrug = useDrug.trim();
      const drugToUse = userDrug || identityParams.suggested_drug || "";

      // PharmGKB and trials don't depend on each other — run concurrently
      // instead of the old sequential waterfall (was summing both wait times).
      const [pharmResult, trialsResult] = await Promise.allSettled([
        drugToUse
          ? fetchPharmGKB(drugToUse, useCondition, identityParams.ancestry_keywords).then(p => ({ ...p, drug_used: drugToUse, drug_source: userDrug ? "user_provided" : "claude_suggested" }))
          : Promise.resolve({
              search_term: useCondition, pharmgkb: null, cpic_guidelines: [], cpic_pairs: [], variant_annotations: [],
              sources: {}, data_found: false, fetch_errors: [], drug_used: null, drug_source: "none",
              ancestry_representation: { total_variant_studies: 0, studies_with_ancestry_match: 0, percentage: null, note: "No drug specified, and no well-established standard drug could be identified for this condition." },
            }),
        fetchTrials(useCondition, {
          sex: identityParams.sex, min_age: identityParams.min_age, max_age: identityParams.max_age,
          ancestry_keywords: identityParams.ancestry_keywords, condition_keywords: identityParams.condition_keywords,
          diversity_keywords: identityParams.diversity_keywords,
        }),
      ]);

      if (pharmResult.status === "fulfilled") setPharmData(pharmResult.value);
      else setPharmData({ search_term: drugToUse || useCondition, data_found: false, fetch_errors: [pharmResult.reason?.message || "request failed"], cpic_pairs: [], cpic_guidelines: [], ancestry_representation: {} });

      if (trialsResult.status === "fulfilled") setTrialData(trialsResult.value);
      else setTrialData({ recruiting: { trials: [], total_count: 0, fetch_error: trialsResult.reason?.message || "request failed" }, diversity: { fetch_error: trialsResult.reason?.message || "request failed" } });

      // Shareable URL — encode the search so it can be bookmarked or sent on.
      const qp = new URLSearchParams({ condition: useCondition, identity: useIdentity });
      if (useDrug.trim()) qp.set("drug", useDrug.trim());
      window.history.replaceState(null, "", `?${qp.toString()}`);

      setStage("done");
    } catch (err) {
      setError(err.message);
      setStage("input");
    }
  }, [condition, identity, drug]);

  // Read a shared link on load and auto-run it once.
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const c = qp.get("condition"); const i = qp.get("identity"); const d = qp.get("drug") || "";
    if (c && i) {
      setCondition(c); setIdentity(i); setDrug(d);
      analyse({ condition: c, identity: i, drug: d });
    }
    // Intentionally run once on mount only. analyse() and the setters are
    // stable/safe to omit here — including analyse would re-run this effect
    // on every state change it makes, replaying the URL params in a loop.
    // eslint-disable-next-line
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function tryExample() {
    setIdentity(EXAMPLE.identity); setCondition(EXAMPLE.condition); setDrug(EXAMPLE.drug);
  }

  const canRun = condition.trim() && identity.trim() && stage === "input";
  const rec = trialData?.recruiting;
  const div = trialData?.diversity;
  const verdictFacts = stage === "done" ? buildVerdictFacts({ pharm: pharmData, trials: trialData }) : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "Inter, -apple-system, Roboto, Arial, sans-serif", color: "var(--text)" }}>
      <style>{TOKENS}</style>

      {/* Top bar */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--data-soft)", color: "var(--data)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="molecule" size={18} />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-3)", fontWeight: 700 }}>Open Drug Trials</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Real data, no black boxes</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stage !== "input" && (
            <button onClick={reset} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 20, padding: "8px 18px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", marginLeft: 8 }}>
              New search
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>

        {/* INPUT */}
        {stage === "input" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h1 style={{ fontSize: "var(--fs-6)", fontWeight: 700, margin: "0 0 12px", letterSpacing: -0.5 }}>
                Does this treatment work for people like you?
              </h1>
              <p style={{ fontSize: "var(--fs-3)", color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                Real published data — not an AI guess, not a fabricated score.
              </p>
            </div>

            <Card>
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="identity" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
                  Describe yourself <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <button type="button" onClick={tryExample} style={{ background: "none", border: "none", color: "var(--data)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  Try an example
                </button>
              </div>
              <textarea id="identity" value={identity} onChange={e => setIdentity(e.target.value)} rows={3}
                aria-describedby="identity-privacy-note"
                placeholder="e.g. South Asian woman in my 40s with ADHD... or Trans man, 30s... or Black woman, autistic..."
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "var(--text)", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }} />

              <div id="identity-privacy-note" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--data-soft)", border: "1px solid var(--data-border)", borderRadius: 8, padding: "10px 12px", marginTop: 10, marginBottom: 20, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0, marginTop: 1, color: "var(--data)" }}><Icon name="info" size={13} /></span>
                <span>This text is sent to Anthropic's Claude API, once, to extract sex/age/ancestry as search filters. Nothing is stored — not by this app, not by Claude.</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <label htmlFor="condition" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                    Condition <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input id="condition" value={condition} onChange={e => setCondition(e.target.value)}
                    placeholder="e.g. Type 2 diabetes, depression..."
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "var(--text)", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label htmlFor="drug" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                    Drug <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input id="drug" value={drug} onChange={e => setDrug(e.target.value)}
                    placeholder="e.g. Metformin, Sertraline..."
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "var(--text)", fontFamily: "inherit" }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Open source, MIT licensed</span>
                <button onClick={() => analyse()} disabled={!canRun}
                  style={{ background: canRun ? "var(--data)" : "#eeece7", color: canRun ? "#fff" : "var(--text-faint)", border: "none", borderRadius: 20, padding: "10px 28px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: canRun ? "pointer" : "default" }}>
                  Search
                </button>
              </div>
            </Card>

            {error && <Banner kind="danger">{error}</Banner>}
          </div>
        )}

        {/* LOADING */}
        {(stage === "parsing" || stage === "fetching") && (
          <Card style={{ textAlign: "center", padding: 48 }}>
            <LoadingRow label={stage === "parsing" ? "Extracting search parameters from your description..." : "Querying PharmGKB, CPIC and ClinicalTrials.gov..."} />
          </Card>
        )}

        {/* RESULTS */}
        {stage === "done" && (
          <div>
            {parsed && (
              <Card style={{ marginBottom: 20, animation: "fadeUp 0.3s ease" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--data)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Search parameters extracted <Pill variant="data" small>Claude</Pill>
                </div>
                <div style={{ fontSize: 14, marginBottom: 10 }}>{parsed.display_identity}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {parsed.sex && parsed.sex !== "ALL" && <Pill small>Sex: {parsed.sex}</Pill>}
                  {parsed.min_age && <Pill small>Age: ~{parsed.min_age}</Pill>}
                  {parsed.ancestry_keywords?.slice(0, 6).map(k => <Pill key={k} small>{k}</Pill>)}
                  {parsed.ancestry_keywords?.length > 6 && <Pill small>+{parsed.ancestry_keywords.length - 6} more</Pill>}
                </div>
              </Card>
            )}

            {/* HEADLINE VERDICT — synthesized language, not a fabricated score */}
            {verdictFacts.length > 0 && (
              <Card style={{ marginBottom: 20, background: "var(--text)", color: "#fff", animation: "fadeUp 0.3s ease" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#c9c7bf", marginBottom: 12 }}>What the real data shows</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {verdictFacts.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 16, lineHeight: 1.5 }}>
                      <span style={{ flexShrink: 0, marginTop: 3, width: 6, height: 6, borderRadius: "50%", background: f.tone === "danger" ? "#e88a84" : f.tone === "match" ? "#e0a458" : "#4fd1d1" }} />
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* PHARMACOGENOMICS */}
            <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease" }}>
              <SectionHeader icon="flask" title="Pharmacogenomics" subtitle="How your genes affect this drug, from real lab studies" />

              {pharmData.drug_source === "claude_suggested" && (
                <Banner kind="info">No drug entered — Claude suggested <strong>{pharmData.drug_used}</strong> as a well-established standard treatment. The data below is real PharmGKB/CPIC data for that drug; only the drug choice is AI-suggested.</Banner>
              )}
              {pharmData.drug_source === "none" && (
                <Banner kind="warning">No drug entered, and no well-established standard drug could be confidently identified. Enter a drug name to see this section.</Banner>
              )}
              {pharmData.fetch_errors?.length > 0 && (
                <Banner kind="danger">Request failed — this is not "no data": {pharmData.fetch_errors.join("; ")}</Banner>
              )}
              {pharmData.drug_source !== "none" && !pharmData.fetch_errors?.length && !pharmData.data_found && (
                <Banner kind="warning">No PharmGKB data found for "{pharmData.search_term}". Try a more specific drug name.</Banner>
              )}

              {pharmData.cpic_pairs?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CPIC gene-drug pairs <Pill variant="data" small>{pharmData.cpic_pairs.length} found</Pill></div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10, lineHeight: 1.5 }}>
                    A gene-drug pair means: your genes here can change how this drug works for you. CPIC's evidence level tells you how sure they are — A/B is strong, actionable evidence; C/D is weaker or preliminary.
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {pharmData.cpic_pairs.map((pair, i) => (
                      <div key={i} style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13 }}><strong>{pair.drug}</strong> <span style={{ color: "var(--text-faint)" }}>×</span> <strong style={{ color: "var(--data)" }}>{pair.gene}</strong></div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Pill variant={["A", "B"].includes(String(pair.cpic_level).toUpperCase()) ? "data" : "neutral"} small>Level {pair.cpic_level}</Pill>
                          {pair.url && <a href={pair.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Guideline</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pharmData.ancestry_representation?.note && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  {pharmData.ancestry_representation.note}
                  {pharmData.ancestry_representation.percentage !== null && pharmData.ancestry_representation.percentage !== undefined && (
                    <div style={{ marginTop: 8 }}>
                      <ProgressBar value={pharmData.ancestry_representation.percentage} matches={pharmData.ancestry_representation.studies_with_ancestry_match > 0} />
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* DIVERSITY */}
            {div && (
              <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease" }}>
                <SectionHeader icon="bars" title="Research diversity" subtitle="Who has actually been studied for this condition" />

                {div.fetch_error ? (
                  <Banner kind="danger">Request failed — this is not "no data": {div.fetch_error}</Banner>
                ) : !div.data_available ? (
                  <Banner kind="warning">{div.note}</Banner>
                ) : (
                  <div>
                    <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-faint)" }}>
                      {div.stats.total_participants_counted.toLocaleString()} participants across {div.stats.trials_with_demographics} trials
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {div.stats.groups.map((g, i) => (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                            <span style={{ fontWeight: g.matches_user ? 600 : 400, color: g.matches_user ? "var(--match)" : "var(--text)" }}>
                              {g.group}{g.matches_user ? " — matches you" : ""}
                            </span>
                            <span style={{ fontWeight: 600, color: g.matches_user ? "var(--match)" : "var(--text-muted)" }}>{g.percentage}% ({g.count.toLocaleString()})</span>
                          </div>
                          <ProgressBar value={g.percentage} matches={g.matches_user} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* TRIALS */}
            {rec && (
              <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease" }}>
                <SectionHeader icon="clipboard" title="Recruiting trials" subtitle="Trials currently enrolling that may fit you" />

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: "var(--data-soft)", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--data)" }}>{(rec.total_count ?? 0).toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Total recruiting worldwide</div>
                  </div>
                  <div style={{ flex: 1, background: "var(--match-soft)", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--match)" }}>{rec.trials?.length ?? 0}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Match your profile</div>
                  </div>
                </div>

                {rec.fetch_error ? (
                  <Banner kind="danger">Request failed — this is not "zero trials": {rec.fetch_error}</Banner>
                ) : rec.trials?.length === 0 && (
                  <Banner kind="warning">No recruiting trials matched your filters. Try broadening the condition or check the spelling against ClinicalTrials.gov's terms.</Banner>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {rec.trials?.map((trial, i) => {
                    const preview = trial.matched_keywords?.length > 0
                      ? (trial.eligibility_text || "").split(/(?<=[.!?])\s+/).find(s => trial.matched_keywords.some(k => s.toLowerCase().includes(k))) || trial.eligibility_text?.slice(0, 180)
                      : trial.eligibility_text?.slice(0, 180);
                    return (
                      <div key={i} className="trial-card"
                        onClick={() => setExpandedTrial(expandedTrial === i ? null : i)}
                        style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${trial.seeks_diverse ? "var(--match)" : "var(--border)"}`, borderRadius: 8, padding: 14, cursor: "pointer", background: "var(--surface)" }}>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: "var(--data)", fontWeight: 600 }}>{trial.id}</span>
                              {trial.phase && <Pill small>{formatPhase(trial.phase) || trial.phase}</Pill>}
                              {trial.seeks_diverse && <Pill variant="match" small>Diversity keywords found</Pill>}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{trial.title}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {trial.countries?.join(", ") || "Location not listed"}
                              {trial.sex_eligibility && trial.sex_eligibility !== "ALL" && ` · ${trial.sex_eligibility} only`}
                              {trial.min_age && ` · ${trial.min_age}${trial.max_age ? `–${trial.max_age}` : "+"}`}
                              {phaseGloss(trial.phase) && ` · ${phaseGloss(trial.phase)}`}
                            </div>
                            {preview && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.5 }}>{preview}{preview.length >= 180 ? "…" : ""}</div>}
                          </div>
                          <span style={{ marginLeft: 12, color: "var(--text-faint)", flexShrink: 0 }}>
                            <Icon name={expandedTrial === i ? "chevronUp" : "chevronDown"} size={16} />
                          </span>
                        </div>

                        {expandedTrial === i && (
                          <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                              Full eligibility criteria (from ClinicalTrials.gov)
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.7, background: "var(--bg)", borderRadius: 8, padding: 12, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-line" }}>
                              {trial.eligibility_text || "Not provided"}
                            </div>
                            <a href={trial.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              style={{ display: "inline-block", marginTop: 12, background: "var(--data)", color: "#fff", borderRadius: 20, padding: "9px 22px", fontSize: 13, fontWeight: 600 }}>
                              View on ClinicalTrials.gov
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* NEXT STEPS — the old version dead-ended on raw data */}
            <Card style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What to do with this</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
                This isn't medical advice. If a trial above looks like a fit, bring its ID — the code like NCT01234567 shown on the card — to your doctor; they can confirm eligibility and next steps. Every number on this page links back to its real source, so you or your doctor can verify it independently.
              </p>
              <button onClick={copyLink} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="link" size={14} />
                {linkCopied ? "Link copied" : "Copy shareable link"}
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
