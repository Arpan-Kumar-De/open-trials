import { useState } from "react";

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

// ── UI Components ─────────────────────────────────────────────────

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", padding: 24, ...style }}>{children}</div>
);

const Chip = ({ label, color = "#1a73e8", small }) => (
  <span style={{ display: "inline-block", background: color + "18", color, borderRadius: 16, padding: small ? "2px 8px" : "4px 12px", fontSize: small ? 11 : 12, fontWeight: 500, marginRight: 6, marginBottom: 6 }}>{label}</span>
);

const Tag = ({ label }) => (
  <span style={{ display: "inline-block", background: "#f1f3f4", color: "#5f6368", borderRadius: 4, padding: "2px 8px", fontSize: 11, marginRight: 4, marginBottom: 4, fontFamily: "monospace" }}>{label}</span>
);

const DataLabel = ({ label }) => (
  <span style={{ fontSize: 11, color: "#1e8e3e", background: "#e8f5e9", borderRadius: 4, padding: "2px 8px", marginLeft: 8, fontWeight: 500 }}>✓ {label}</span>
);

const WarningBanner = ({ text }) => (
  <div style={{ background: "#fff8e1", border: "1px solid #fdd835", borderRadius: 8, padding: 12, fontSize: 13, color: "#f57f17", marginBottom: 16 }}>
    ⚠ {text}
  </div>
);

const InfoBanner = ({ text }) => (
  <div style={{ background: "#e8f0fe", border: "1px solid #c5d8fb", borderRadius: 8, padding: 12, fontSize: 13, color: "#1a237e", marginBottom: 16 }}>
    ℹ {text}
  </div>
);

const StageHeader = ({ number, title, subtitle, done, loading }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
    <div style={{ width: 36, height: 36, borderRadius: "50%", background: done ? "#1e8e3e" : loading ? "#1a73e8" : "#e8eaed", color: done || loading ? "#fff" : "#80868b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, transition: "all 0.3s" }}>
      {done ? "✓" : number}
    </div>
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#202124" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "#80868b", marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>
);

const LoadingDots = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
    <div style={{ display: "flex", gap: 5 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#1a73e8", animation: `bounce 1s ${i * 0.15}s infinite` }} />
      ))}
    </div>
    <span style={{ fontSize: 13, color: "#5f6368" }}>{label}</span>
  </div>
);

const PercentBar = ({ value, color = "#1a73e8", matches }) => (
  <div style={{ height: 8, background: "#f1f3f4", borderRadius: 4, overflow: "hidden", border: matches ? `2px solid ${color}` : "none" }}>
    <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: color, borderRadius: 4, transition: "width 1s ease" }} />
  </div>
);

// ── Main App ──────────────────────────────────────────────────────

export default function OpenDrugTrials() {
  const [condition, setCondition] = useState("");
  const [drug, setDrug] = useState("");
  const [identity, setIdentity] = useState("");
  const [stage, setStage] = useState(0);
  const [parsed, setParsed] = useState(null);
  const [pharmData, setPharmData] = useState(null);
  const [trialData, setTrialData] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [expandedTrial, setExpandedTrial] = useState(null);

  function reset() {
    setStage(0); setParsed(null); setPharmData(null);
    setTrialData(null); setError(null); setStatusMsg("");
    setExpandedTrial(null);
  }

  async function analyse() {
    if (!condition.trim() || !identity.trim()) return;
    reset();

    try {
      // Step 0 — Claude extracts structured params (only LLM call)
      setStage(1);
      setStatusMsg("Extracting search parameters from your description...");
      const identityParams = await parseIdentity(identity, condition);
      setParsed(identityParams);

      // Step 1 — PharmGKB real data
      setStatusMsg("Querying PharmGKB database...");
      const pharm = await fetchPharmGKB(drug, condition, identityParams.ancestry_keywords);
      setPharmData(pharm);

      // Step 2 — ClinicalTrials.gov real data
      setStage(2);
      setStatusMsg("Fetching live trials from ClinicalTrials.gov...");
      const trials = await fetchTrials(condition, {
        sex: identityParams.sex,
        min_age: identityParams.min_age,
        max_age: identityParams.max_age,
        ancestry_keywords: identityParams.ancestry_keywords,
        condition_keywords: identityParams.condition_keywords,
        diversity_keywords: identityParams.diversity_keywords,
      });
      setTrialData(trials);

      setStage(3);
      setStatusMsg("");

    } catch (err) {
      setError(err.message);
      setStage(0);
    }
  }

  const canRun = condition.trim() && identity.trim() && stage === 0;
  const rec = trialData?.recruiting;
  const div = trialData?.diversity;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "Google Sans, Roboto, Arial, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
        * { box-sizing: border-box; }
        input:focus, textarea:focus { outline:none!important; border-color:#1a73e8!important; box-shadow:0 0 0 2px #1a73e820!important; }
        .trial-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.15)!important; }
        a { color: #1a73e8; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8eaed", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #1a73e8, #0d47a1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧬</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#202124" }}>Open Drug Trials</div>
            <div style={{ fontSize: 11, color: "#80868b" }}>Real data · No black boxes</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {["PharmGKB", "CPIC", "ClinicalTrials.gov"].map(s => (
            <span key={s} style={{ fontSize: 11, color: "#1e8e3e", background: "#e8f5e9", borderRadius: 12, padding: "4px 10px", fontWeight: 500 }}>{s}</span>
          ))}
          {stage > 0 && (
            <button onClick={reset} style={{ background: "none", border: "1px solid #dadce0", borderRadius: 20, padding: "8px 18px", fontSize: 13, color: "#5f6368", cursor: "pointer", fontFamily: "inherit", marginLeft: 8 }}>
              ← New search
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>

        {/* INPUT */}
        {stage === 0 && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>💊</div>
              <h1 style={{ fontSize: 30, fontWeight: 700, color: "#202124", margin: "0 0 12px", letterSpacing: -0.5 }}>
                Does this treatment work for you?
              </h1>
              <p style={{ fontSize: 15, color: "#5f6368", margin: 0, lineHeight: 1.7 }}>
                Real data from PharmGKB, CPIC and ClinicalTrials.gov.<br />
                No AI guesses. No fabricated scores.
              </p>
            </div>

            <Card>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#5f6368", display: "block", marginBottom: 8 }}>
                  Describe yourself <span style={{ color: "#d93025" }}>*</span>
                </label>
                <textarea value={identity} onChange={e => setIdentity(e.target.value)} rows={3}
                  placeholder="e.g. South Asian woman in my 40s with ADHD... or Trans man, 30s... or Black woman, autistic..."
                  style={{ width: "100%", border: "1px solid #dadce0", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "#202124", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6, transition: "all 0.2s" }} />
                <div style={{ fontSize: 12, color: "#80868b", marginTop: 6 }}>
                  Used only to extract search parameters — sex, age, ancestry keywords. Nothing stored.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5f6368", display: "block", marginBottom: 8 }}>
                    Condition <span style={{ color: "#d93025" }}>*</span>
                  </label>
                  <input value={condition} onChange={e => setCondition(e.target.value)}
                    placeholder="e.g. Type 2 diabetes, depression..."
                    style={{ width: "100%", border: "1px solid #dadce0", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "#202124", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#5f6368", display: "block", marginBottom: 8 }}>
                    Drug <span style={{ color: "#80868b", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input value={drug} onChange={e => setDrug(e.target.value)}
                    placeholder="e.g. Metformin, Sertraline..."
                    style={{ width: "100%", border: "1px solid #dadce0", borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "#202124", fontFamily: "inherit" }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#80868b" }}>Data from PharmGKB, CPIC & ClinicalTrials.gov · Open source · MIT</span>
                <button onClick={analyse} disabled={!canRun}
                  style={{ background: canRun ? "#1a73e8" : "#f1f3f4", color: canRun ? "#fff" : "#80868b", border: "none", borderRadius: 20, padding: "10px 28px", fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: canRun ? "pointer" : "default", transition: "all 0.2s" }}>
                  Search →
                </button>
              </div>
            </Card>

            {error && (
              <Card style={{ marginTop: 16, background: "#fce8e6", boxShadow: "none" }}>
                <div style={{ fontSize: 14, color: "#d93025" }}>⚠ {error}</div>
              </Card>
            )}
          </div>
        )}

        {/* RESULTS */}
        {stage >= 1 && (
          <div>
            {/* Parsed identity — show exactly what Claude extracted */}
            {parsed && (
              <Card style={{ marginBottom: 20, background: "#e8f0fe", boxShadow: "none", border: "1px solid #c5d8fb", animation: "fadeUp 0.3s ease" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1a73e8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  Search parameters extracted
                  <DataLabel label="Claude extraction" />
                </div>
                <div style={{ fontSize: 14, color: "#1a237e", marginBottom: 10 }}>{parsed.display_identity}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
                  {parsed.sex && parsed.sex !== "ALL" && <span style={{ color: "#5f6368" }}>Sex filter: <strong>{parsed.sex}</strong></span>}
                  {parsed.min_age && <span style={{ color: "#5f6368" }}>Age: ~<strong>{parsed.min_age}</strong></span>}
                  {parsed.ancestry_keywords?.length > 0 && (
                    <span style={{ color: "#5f6368" }}>Ancestry keywords: {parsed.ancestry_keywords.map(k => <Tag key={k} label={k} />)}</span>
                  )}
                  {parsed.diversity_keywords?.length > 0 && (
                    <span style={{ color: "#5f6368" }}>Diversity keywords: {parsed.diversity_keywords.map(k => <Tag key={k} label={k} />)}</span>
                  )}
                </div>
                {statusMsg && (
                  <div style={{ fontSize: 12, color: "#1a73e8", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a73e8", animation: "bounce 1s infinite" }} />
                    {statusMsg}
                  </div>
                )}
              </Card>
            )}

            {/* STAGE 1 — PharmGKB */}
            <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease" }}>
              <StageHeader number="1" title="Pharmacogenomics Data"
                subtitle="From PharmGKB & CPIC — peer-reviewed gene-drug associations"
                done={!!pharmData} loading={stage === 1 && !pharmData} />

              {stage === 1 && !pharmData && <LoadingDots label="Querying PharmGKB..." />}

              {pharmData && (
                <div style={{ animation: "fadeUp 0.3s ease" }}>
                  {!pharmData.data_found && (
                    <WarningBanner text={`No PharmGKB data found for "${pharmData.search_term}". This drug may not yet have pharmacogenomics data, or try a more specific drug name.`} />
                  )}

                  {/* CPIC gene-drug pairs */}
                  {pharmData.cpic_pairs?.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#202124", marginBottom: 12 }}>
                        CPIC Gene-Drug Pairs
                        <DataLabel label={`${pharmData.cpic_pairs.length} found`} />
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {pharmData.cpic_pairs.map((pair, i) => (
                          <div key={i} style={{ background: "#f8f9fa", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ fontWeight: 600, color: "#202124" }}>{pair.drug}</span>
                              <span style={{ color: "#80868b", margin: "0 8px" }}>×</span>
                              <span style={{ fontWeight: 600, color: "#1a73e8" }}>{pair.gene}</span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Chip label={`Level ${pair.cpic_level}`}
                                color={pair.cpic_level === "A" ? "#1e8e3e" : pair.cpic_level === "B" ? "#f9ab00" : "#80868b"} small />
                              <Chip label={pair.cpic_status} color="#5f6368" small />
                              {pair.url && <a href={pair.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Guideline →</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "#80868b", marginTop: 8 }}>
                        CPIC Level A = strong evidence for clinical action · B = moderate · C/D = limited
                      </div>
                    </div>
                  )}

                  {/* PharmGKB guidelines */}
                  {pharmData.cpic_guidelines?.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#202124", marginBottom: 12 }}>
                        Clinical Guidelines
                        <DataLabel label="PharmGKB" />
                      </div>
                      {pharmData.cpic_guidelines.map((g, i) => (
                        <div key={i} style={{ background: "#f8f9fa", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, color: "#202124" }}>{g.name}</span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Chip label={g.source} color="#5f6368" small />
                            {g.url && <a href={g.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View →</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ancestry representation in variant studies */}
                  <div style={{ background: pharmData.ancestry_representation?.studies_with_ancestry_match > 0 ? "#e8f5e9" : "#fce8e6", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: pharmData.ancestry_representation?.studies_with_ancestry_match > 0 ? "#1e8e3e" : "#d93025", marginBottom: 6 }}>
                      Your ancestry in variant studies
                      <DataLabel label="PharmGKB" />
                    </div>
                    <div style={{ fontSize: 14, color: "#202124", lineHeight: 1.6 }}>
                      {pharmData.ancestry_representation?.note}
                    </div>
                    {pharmData.ancestry_representation?.percentage !== null && (
                      <div style={{ marginTop: 8 }}>
                        <PercentBar
                          value={pharmData.ancestry_representation.percentage}
                          color={pharmData.ancestry_representation.percentage > 20 ? "#1e8e3e" : "#d93025"}
                          matches={true} />
                        <div style={{ fontSize: 11, color: "#80868b", marginTop: 4 }}>
                          {pharmData.ancestry_representation.percentage}% of variant studies included your ancestry group
                        </div>
                      </div>
                    )}
                  </div>

                  {pharmData.sources?.pharmgkb && (
                    <div style={{ marginTop: 12, fontSize: 12, color: "#80868b" }}>
                      Source: <a href={pharmData.sources.pharmgkb} target="_blank" rel="noreferrer">PharmGKB</a> · <a href={pharmData.sources.cpic} target="_blank" rel="noreferrer">CPIC</a>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* STAGE 2 — Diversity */}
            {stage >= 2 && trialData && (
              <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease" }}>
                <StageHeader number="2" title="Research Diversity"
                  subtitle={`From completed trials on ClinicalTrials.gov that reported demographics`}
                  done={stage >= 3} loading={stage === 2} />

                {stage === 2 && !trialData && <LoadingDots label="Analysing completed trials..." />}

                {trialData && (
                  <div style={{ animation: "fadeUp 0.3s ease" }}>
                    {!div.data_available ? (
                      <div>
                        <WarningBanner text="No demographic breakdown data found in completed trial results for this condition." />
                        <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 16, fontSize: 14, color: "#202124", lineHeight: 1.7 }}>
                          <strong>This is itself a finding.</strong> {div.note}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <InfoBanner text={div.note} />
                        <div style={{ marginBottom: 8, fontSize: 12, color: "#80868b" }}>
                          {div.stats.total_participants_counted.toLocaleString()} total participants counted across {div.stats.trials_with_demographics} trials
                          <DataLabel label="ClinicalTrials.gov results" />
                        </div>
                        <div style={{ display: "grid", gap: 12 }}>
                          {div.stats.groups.map((g, i) => (
                            <div key={i}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13, color: "#202124", fontWeight: g.matches_user ? 600 : 400 }}>{g.group}</span>
                                  {g.matches_user && <Chip label="Matches you" color="#1e8e3e" small />}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: g.matches_user ? "#1e8e3e" : "#5f6368" }}>
                                  {g.percentage}% ({g.count.toLocaleString()})
                                </div>
                              </div>
                              <PercentBar value={g.percentage} color={g.matches_user ? "#1e8e3e" : "#1a73e8"} matches={g.matches_user} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* STAGE 3 — Trials */}
            {stage >= 3 && rec && (
              <Card style={{ animation: "fadeUp 0.4s ease" }}>
                <StageHeader number="3" title="Recruiting Trials"
                  subtitle="Live from ClinicalTrials.gov — filtered by your parameters"
                  done={true} />

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: "#e8f0fe", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#1a73e8" }}>{rec.total_count.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>Recruiting worldwide</div>
                  </div>
                  <div style={{ flex: 1, background: "#e8f5e9", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#1e8e3e" }}>{rec.diversity_keyword_matches}</div>
                    <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>With diversity keywords</div>
                  </div>
                </div>

                {rec.filters_applied && (
                  <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: "#5f6368" }}>
                    Filters applied: sex={rec.filters_applied.sex || "ALL"}
                    {rec.filters_applied.min_age ? `, age≈${rec.filters_applied.min_age}` : ""}
                    {rec.filters_applied.keywords?.length > 0 && (
                      <span> · Keywords: {rec.filters_applied.keywords.map(k => <Tag key={k} label={k} />)}</span>
                    )}
                  </div>
                )}

                {rec.trials?.length === 0 && (
                  <WarningBanner text="No recruiting trials found matching your filters. Try broadening your search." />
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {rec.trials?.map((trial, i) => (
                    <div key={i} className="trial-card"
                      onClick={() => setExpandedTrial(expandedTrial === i ? null : i)}
                      style={{ border: "1px solid #e8eaed", borderLeft: `4px solid ${trial.seeks_diverse ? "#1e8e3e" : trial.matched_keywords?.length > 0 ? "#f9ab00" : "#dadce0"}`, borderRadius: 8, padding: 16, cursor: "pointer", transition: "box-shadow 0.2s", background: "#fff" }}>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: "#1a73e8", fontWeight: 600 }}>{trial.id}</span>
                            {trial.phase && <Chip label={trial.phase} color="#5f6368" small />}
                            <Chip label={trial.status} color={trial.status === "RECRUITING" ? "#1e8e3e" : "#f9ab00"} small />
                            {trial.seeks_diverse && <Chip label="Diversity keywords found" color="#1e8e3e" small />}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#202124", marginBottom: 4 }}>{trial.title}</div>
                          <div style={{ fontSize: 13, color: "#80868b" }}>
                            {trial.countries?.join(", ") || "Location not listed"}
                            {trial.sex_eligibility && trial.sex_eligibility !== "ALL" && ` · ${trial.sex_eligibility} only`}
                            {trial.min_age && ` · ${trial.min_age}${trial.max_age ? `–${trial.max_age}` : "+"}`}
                          </div>
                        </div>
                        <div style={{ fontSize: 20, marginLeft: 12, color: expandedTrial === i ? "#1a73e8" : "#dadce0" }}>
                          {expandedTrial === i ? "▲" : "▼"}
                        </div>
                      </div>

                      {/* Matched keywords — exact string matches, no inference */}
                      {trial.matched_keywords?.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#80868b" }}>Found in eligibility text:</span>
                          {trial.matched_keywords.map(k => <Tag key={k} label={k} />)}
                        </div>
                      )}

                      {expandedTrial === i && (
                        <div style={{ borderTop: "1px solid #f1f3f4", marginTop: 14, paddingTop: 14, animation: "fadeUp 0.2s ease" }}>
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#80868b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                              Eligibility Criteria <span style={{ fontWeight: 400, textTransform: "none" }}>(from ClinicalTrials.gov)</span>
                            </div>
                            <div style={{ fontSize: 13, color: "#202124", lineHeight: 1.7, background: "#f8f9fa", borderRadius: 8, padding: 12, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-line" }}>
                              {trial.eligibility_text || "Not provided"}
                            </div>
                          </div>
                          <a href={trial.url} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display: "inline-block", background: "#1a73e8", color: "#fff", borderRadius: 20, padding: "10px 24px", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
                            View on ClinicalTrials.gov →
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
