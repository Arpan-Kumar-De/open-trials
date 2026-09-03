// api/pharmgkb.js
// Fetches REAL data from PharmGKB (now ClinPGx) and CPIC
// Zero LLM involvement — returns raw structured data
// Frontend displays exactly what databases return
//
// Two infrastructure changes broke this file entirely (verified against the
// live APIs, Sept 2026):
// 1. api.pharmgkb.org was retired 2026-07-20. Same paths/response shapes,
//    new hostname: api.clinpgx.org.
//    See: https://blog.clinpgx.org/retiring-the-api-pharmgkb-org-hostname/
// 2. CPIC's `pair` table schema changed (v1.55.0, 2026-03-13). The columns
//    this file used to filter/select (drugname, genename, cpicStatus, level,
//    url) no longer exist. Current schema: `drug` has {drugid, name}, `pair`
//    has {drugid, genesymbol, cpiclevel, pgxtesting, guidelineid} — no drug
//    name or url on `pair` itself, so drug-name lookup and the guideline URL
//    now require two extra joins (drug -> pair -> guideline).
//    See: https://blog.clinpgx.org/updates-to-the-cpic-database-and-api/

const PHARMGKB_BASE = "https://api.clinpgx.org";
const CPIC_BASE = "https://api.cpicpgx.org";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { drug, condition, ancestry_keywords } = req.body;
  const searchTerm = drug || condition;
  if (!searchTerm) return res.status(400).json({ error: "Drug or condition required" });

  const results = {
    search_term: searchTerm,
    pharmgkb: null,
    cpic_guidelines: [],
    cpic_pairs: [],
    variant_annotations: [],
    sources: {},
    data_found: false,
    fetch_errors: [],  // surfaced instead of silently swallowed
  };

  // 1. Search PharmGKB/ClinPGx for the chemical/drug
  try {
    const searchUrl = `${PHARMGKB_BASE}/v1/data/chemical?view=base&name=${encodeURIComponent(searchTerm)}`;
    const searchRes = await fetch(searchUrl, { headers: { "Accept": "application/json" } });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const chemicals = searchData.data || [];

      if (chemicals.length > 0) {
        const chem = chemicals[0];
        results.pharmgkb = {
          id: chem.id,
          name: chem.name,
          url: `https://www.clinpgx.org/chemical/${chem.id}`,
        };
        results.data_found = true;
        results.sources.pharmgkb = results.pharmgkb.url;

        // 2. Fetch CPIC/clinical guidelines for this drug
        try {
          const guidelinesUrl = `${PHARMGKB_BASE}/v1/data/guideline?relatedChemicals.id=${chem.id}&view=base`;
          const guidelinesRes = await fetch(guidelinesUrl, { headers: { "Accept": "application/json" } });
          if (guidelinesRes.ok) {
            const guidelinesData = await guidelinesRes.json();
            results.cpic_guidelines = (guidelinesData.data || []).map(g => ({
              name: g.name,
              source: g.source,
              id: g.id,
              url: g.id ? `https://www.clinpgx.org/guideline/${g.id}` : null,
            }));
          } else {
            results.fetch_errors.push(`PharmGKB guidelines: HTTP ${guidelinesRes.status}`);
          }
        } catch (e) {
          results.fetch_errors.push(`PharmGKB guidelines: ${e.message}`);
        }

        // 3. Fetch variant annotations
        try {
          const varUrl = `${PHARMGKB_BASE}/v1/data/variantAnnotation?relatedChemicals.id=${chem.id}&view=base&pageSize=20`;
          const varRes = await fetch(varUrl, { headers: { "Accept": "application/json" } });
          if (varRes.ok) {
            const varData = await varRes.json();
            results.variant_annotations = (varData.data || []).map(v => ({
              gene: v.relatedGenes?.[0]?.symbol || null,
              variant: v.variant?.name || null,
              significance: v.significance || null,
              evidence_level: v.evidenceLevel || null,
              // Population data where available
              study_population: v.studyParameters?.[0]?.studySubjects || null,
              ethnicity: v.studyParameters?.[0]?.populationEthnicity || null,
              // Flag if ancestry keywords match
              ancestry_match: ancestry_keywords?.some(k =>
                (v.studyParameters?.[0]?.populationEthnicity || "").toLowerCase().includes(k.toLowerCase())
              ) || false,
            }));
          } else {
            results.fetch_errors.push(`PharmGKB variant annotations: HTTP ${varRes.status}`);
          }
        } catch (e) {
          results.fetch_errors.push(`PharmGKB variant annotations: ${e.message}`);
        }
      }
    } else {
      results.fetch_errors.push(`PharmGKB chemical search: HTTP ${searchRes.status}`);
    }
  } catch (e) {
    results.fetch_errors.push(`PharmGKB chemical search: ${e.message}`);
    console.error("PharmGKB error:", e.message);
  }

  // 4. CPIC direct API — drug-gene pairs with evidence.
  // `pair` no longer carries a drug name or a URL directly — resolve the
  // drug name to its drugid first, then join guideline for the URL.
  try {
    const drugUrl = `${CPIC_BASE}/v1/drug?name=ilike.*${encodeURIComponent(searchTerm)}*&select=drugid,name`;
    const drugRes = await fetch(drugUrl, { headers: { "Accept": "application/json" } });

    if (drugRes.ok) {
      const drugs = await drugRes.json();

      if (Array.isArray(drugs) && drugs.length > 0) {
        const drugIdList = drugs.map(d => d.drugid);
        const drugNameById = Object.fromEntries(drugs.map(d => [d.drugid, d.name]));
        const idFilter = drugIdList.map(id => encodeURIComponent(id)).join(",");

        const pairUrl = `${CPIC_BASE}/v1/pair?drugid=in.(${idFilter})&removed=eq.false&select=drugid,genesymbol,cpiclevel,pgxtesting,guidelineid`;
        const pairRes = await fetch(pairUrl, { headers: { "Accept": "application/json" } });

        if (pairRes.ok) {
          const pairs = await pairRes.json();

          // Resolve guideline URLs for whichever pairs have one
          const guidelineIds = [...new Set(pairs.map(p => p.guidelineid).filter(Boolean))];
          let guidelineById = {};
          if (guidelineIds.length > 0) {
            const guidelineUrl = `${CPIC_BASE}/v1/guideline?id=in.(${guidelineIds.join(",")})&select=id,name,url`;
            const guidelineRes = await fetch(guidelineUrl, { headers: { "Accept": "application/json" } });
            if (guidelineRes.ok) {
              const guidelines = await guidelineRes.json();
              guidelineById = Object.fromEntries(guidelines.map(g => [g.id, g]));
            } else {
              results.fetch_errors.push(`CPIC guideline lookup: HTTP ${guidelineRes.status}`);
            }
          }

          results.cpic_pairs = pairs.map(p => ({
            drug: drugNameById[p.drugid] || searchTerm,
            gene: p.genesymbol,
            cpic_level: p.cpiclevel,        // A/B/C/D — strength of evidence
            cpic_status: p.pgxtesting,      // e.g. "Actionable PGx" / "Informative PGx"
            url: guidelineById[p.guidelineid]?.url || null,
          }));
          if (results.cpic_pairs.length > 0) results.data_found = true;
          results.sources.cpic = "https://cpicpgx.org/genes-drugs/";
        } else {
          results.fetch_errors.push(`CPIC pair lookup: HTTP ${pairRes.status}`);
        }
      }
    } else {
      results.fetch_errors.push(`CPIC drug lookup: HTTP ${drugRes.status}`);
    }
  } catch (e) {
    results.fetch_errors.push(`CPIC: ${e.message}`);
    console.error("CPIC error:", e.message);
  }

  // 5. How many variant studies included this ancestry — count from real data
  const ancestryStudies = results.variant_annotations.filter(v => v.ancestry_match);
  const totalStudies = results.variant_annotations.length;

  results.ancestry_representation = {
    total_variant_studies: totalStudies,
    studies_with_ancestry_match: ancestryStudies.length,
    percentage: totalStudies > 0 ? Math.round((ancestryStudies.length / totalStudies) * 100) : null,
    note: totalStudies === 0 ? "No variant annotation data found in PharmGKB for this drug" :
          ancestryStudies.length === 0 ? `0 of ${totalStudies} variant studies matched your ancestry keywords` :
          `${ancestryStudies.length} of ${totalStudies} variant studies included populations matching your ancestry`,
  };

  results.fetched_at = new Date().toISOString();
  return res.status(200).json(results);
};
