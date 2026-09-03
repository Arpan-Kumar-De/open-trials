// api/trials.js
// Fetches REAL data from ClinicalTrials.gov API v2
// Zero LLM — pure structured data + keyword matching
// Engine 2: diversity from completed trial results
// Engine 3: matching via hard filters + keyword search

// ClinicalTrials.gov API v2 has no `filter.sex` or bare-number `filter.advanced`
// age-range parameter — sending either causes the API to reject the whole
// request, which the old code swallowed silently and displayed as "no trials
// found" (see api/parse-identity.js consumers). Sex and age are filtered
// client-side instead, against the eligibilityModule fields the API already
// returns for every study.
// See: https://clinicaltrials.gov/data-api/api (full parameter list)

// Converts ClinicalTrials.gov age strings ("18 Years", "6 Months", "N/A") to
// a number of years, or null when unknown/unbounded.
function parseAgeYears(ageStr) {
  if (!ageStr || typeof ageStr !== "string") return null;
  const match = ageStr.match(/(\d+)\s*(Year|Month|Week|Day)/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("year")) return value;
  if (unit.startsWith("month")) return value / 12;
  if (unit.startsWith("week")) return value / 52;
  return value / 365;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { condition, sex, min_age, max_age, ancestry_keywords, condition_keywords, diversity_keywords } = req.body;
  if (!condition) return res.status(400).json({ error: "Condition required" });

  const allKeywords = [
    ...(ancestry_keywords || []),
    ...(condition_keywords || []),
    ...(diversity_keywords || []),
  ].map(k => k.toLowerCase());

  const baseUrl = "https://clinicaltrials.gov/api/v2/studies";
  const conditionEncoded = encodeURIComponent(condition);

  // Patient's effective age range, if any was extracted. A single bound
  // (only min or only max given) is treated as a specific age.
  const patientMin = min_age ?? max_age ?? null;
  const patientMax = max_age ?? min_age ?? null;

  // ── ENGINE 3: Recruiting trials matched to this person ──────────
  let recruiting = [];
  let totalRecruiting = 0;
  let recruitingError = null;

  try {
    // Only send parameters the API v2 spec actually documents — condition
    // and status. Sex/age are hard filters applied below, client-side.
    // countTotal=true is required — otherwise the API omits totalCount
    // entirely and it silently reads as 0, even when trials actually match.
    let url = `${baseUrl}?query.cond=${conditionEncoded}&filter.overallStatus=RECRUITING&pageSize=100&countTotal=true`;

    const fields = "NCTId,BriefTitle,Phase,OverallStatus,EligibilityModule,ContactsLocationsModule,DesignModule,BriefSummary,StatusModule";
    url += `&fields=${fields}`;

    const recruitingRes = await fetch(url, { headers: { "Accept": "application/json" } });

    if (recruitingRes.ok) {
      const recruitingData = await recruitingRes.json();
      totalRecruiting = recruitingData.totalCount || 0;
      const studies = recruitingData.studies || [];

      const allMapped = studies.map(study => {
        const proto = study.protocolSection || {};
        const id = proto.identificationModule || {};
        const status = proto.statusModule || {};
        const eligibility = proto.eligibilityModule || {};
        const contacts = proto.contactsLocationsModule || {};
        const design = proto.designModule || {};

        const eligText = (eligibility.eligibilityCriteria || "").toLowerCase();
        const locations = contacts.locations || [];
        const countries = [...new Set(locations.map(l => l.country).filter(Boolean))];

        // Keyword matching — pure string search, no LLM
        const matchedKeywords = allKeywords.filter(k => eligText.includes(k));
        const seeksDiverse = matchedKeywords.length > 0 ||
          ["diverse", "minority", "underrepresent", "inclusiv", "equity"].some(k => eligText.includes(k));

        return {
          id: id.nctId,
          title: id.briefTitle,
          phase: (design.phases || []).join(", ") || "Not specified",
          status: status.overallStatus,
          countries,
          sex_eligibility: eligibility.sex || "ALL",
          min_age: eligibility.minimumAge || null,
          max_age: eligibility.maximumAge || null,
          eligibility_text: eligibility.eligibilityCriteria || "",
          seeks_diverse: seeksDiverse,
          matched_keywords: matchedKeywords,  // exact keywords found — no inference
          url: `https://clinicaltrials.gov/study/${id.nctId}`,
        };
      });

      // Hard filter on sex, applied to the real eligibilityModule.sex value
      const sexFiltered = (sex && sex !== "ALL")
        ? allMapped.filter(t => t.sex_eligibility === "ALL" || t.sex_eligibility === sex)
        : allMapped;

      // Hard filter on age, applied to the real min/max eligibility ages —
      // only when the person's description actually included an age
      const ageFiltered = (patientMin !== null || patientMax !== null)
        ? sexFiltered.filter(t => {
            const tMin = parseAgeYears(t.min_age) ?? 0;
            const tMax = parseAgeYears(t.max_age) ?? Infinity;
            const pMin = patientMin ?? 0;
            const pMax = patientMax ?? Infinity;
            return pMax >= tMin && pMin <= tMax;
          })
        : sexFiltered;

      recruiting = ageFiltered.slice(0, 25);
    } else {
      const bodyText = await recruitingRes.text();
      recruitingError = `ClinicalTrials.gov returned ${recruitingRes.status}: ${bodyText.slice(0, 300)}`;
      console.error("Recruiting fetch error:", recruitingError);
    }
  } catch (e) {
    recruitingError = e.message;
    console.error("Recruiting fetch error:", e.message);
  }

  // ── ENGINE 2: Diversity from COMPLETED trials with results ──────
  let completedWithDemographics = [];
  let diversityStats = null;
  let completedError = null;

  try {
    // `filter.resultsFirstPostDate` is not a documented API v2 parameter
    // either — sending it 400s the request the same way filter.sex did.
    // Recency isn't load-bearing here: we only keep studies that actually
    // have a resultsSection below, so dropping the date filter just widens
    // the pool instead of silently returning zero.
    const completedUrl = `${baseUrl}?query.cond=${conditionEncoded}&filter.overallStatus=COMPLETED&pageSize=50&countTotal=true&fields=NCTId,BriefTitle,ResultsSection,EligibilityModule`;
    const completedRes = await fetch(completedUrl, { headers: { "Accept": "application/json" } });

    if (completedRes.ok) {
      const completedData = await completedRes.json();
      const studies = completedData.studies || [];

      // Extract real demographics from results where reported
      const demographicsFound = [];

      studies.forEach(study => {
        const results = study.protocolSection?.resultsSection ||
                        study.resultsSection || {};
        const baseline = results.baselineCharacteristicsModule || {};
        const groups = baseline.measures || [];

        // Look for race/ethnicity/sex measures in results
        groups.forEach(measure => {
          const title = (measure.title || "").toLowerCase();
          if (title.includes("race") || title.includes("ethnic") || title.includes("sex") || title.includes("gender")) {
            const classes = measure.classes || [];
            classes.forEach(cls => {
              const categories = cls.categories || [];
              categories.forEach(cat => {
                const measurements = cat.measurements || [];
                const total = measurements.reduce((sum, m) => sum + (parseInt(m.value) || 0), 0);
                if (total > 0) {
                  demographicsFound.push({
                    trial_id: study.protocolSection?.identificationModule?.nctId,
                    measure_type: title.includes("race") || title.includes("ethnic") ? "race_ethnicity" : "sex",
                    group: cat.title || "Unknown",
                    count: total,
                  });
                }
              });
            });
          }
        });
      });

      // Aggregate race/ethnicity across all completed trials
      if (demographicsFound.length > 0) {
        const raceData = demographicsFound.filter(d => d.measure_type === "race_ethnicity");
        const groupTotals = {};
        raceData.forEach(d => {
          const group = d.group;
          groupTotals[group] = (groupTotals[group] || 0) + d.count;
        });

        const grandTotal = Object.values(groupTotals).reduce((a, b) => a + b, 0);
        if (grandTotal > 0) {
          diversityStats = {
            source: "ClinicalTrials.gov results data",
            trials_with_demographics: [...new Set(raceData.map(d => d.trial_id))].length,
            total_participants_counted: grandTotal,
            groups: Object.entries(groupTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([group, count]) => ({
                group,
                count,
                percentage: Math.round((count / grandTotal) * 100),
                // Flag if this matches user's ancestry
                matches_user: ancestry_keywords?.some(k =>
                  group.toLowerCase().includes(k.toLowerCase())
                ) || false,
              })),
          };
        }
      }

      completedWithDemographics = studies
        .filter(s => s.protocolSection?.resultsSection || s.resultsSection)
        .map(s => ({
          id: s.protocolSection?.identificationModule?.nctId,
          title: s.protocolSection?.identificationModule?.briefTitle,
          has_demographics: true,
        }));
    } else {
      const bodyText = await completedRes.text();
      completedError = `ClinicalTrials.gov returned ${completedRes.status}: ${bodyText.slice(0, 300)}`;
      console.error("Completed trials fetch error:", completedError);
    }
  } catch (e) {
    completedError = e.message;
    console.error("Completed trials fetch error:", e.message);
  }

  return res.status(200).json({
    // Engine 3 — recruiting
    recruiting: {
      trials: recruiting,
      total_count: totalRecruiting,
      diversity_keyword_matches: recruiting.filter(t => t.seeks_diverse).length,
      filters_applied: {
        sex, min_age, max_age, keywords: allKeywords,
        method: "sex and age are filtered client-side against ClinicalTrials.gov's own eligibility fields — the API has no filter.sex or bare-number age parameter",
      },
      // Surfaced instead of silently swallowed — a fetch failure should never
      // look identical to "genuinely zero trials match".
      fetch_error: recruitingError,
    },
    // Engine 2 — diversity
    diversity: {
      stats: diversityStats,
      completed_with_results: completedWithDemographics.length,
      data_available: !!diversityStats,
      note: completedError ?
        `Could not fetch completed-trial results from ClinicalTrials.gov: ${completedError}` :
        !diversityStats ?
        "No structured demographic data found in completed trial results for this condition. This itself reflects the reporting gap — most trials do not submit demographic breakdowns." :
        `Based on ${diversityStats.trials_with_demographics} completed trials that reported participant demographics.`,
      fetch_error: completedError,
    },
    source: "ClinicalTrials.gov API v2",
    fetched_at: new Date().toISOString(),
  });
};
