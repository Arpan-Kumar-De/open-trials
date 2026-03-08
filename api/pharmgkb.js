// api/pharmgkb.js
// Fetches REAL data from PharmGKB and CPIC
// Zero LLM involvement — returns raw structured data
// Frontend displays exactly what databases return

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { drug, condition, ancestry_keywords } = req.body;
  const searchTerm = drug || condition;
  if (!searchTerm) return res.status(400).json({ error: "Drug or condition required" });

  const results = {
    search_term: searchTerm,
    pharmgkb: null,
    cpic_guidelines: [],
    variant_annotations: [],
    sources: {},
    data_found: false,
  };

  // 1. Search PharmGKB for the chemical/drug
  try {
    const searchUrl = `https://api.pharmgkb.org/v1/data/chemical?view=base&name=${encodeURIComponent(searchTerm)}`;
    const searchRes = await fetch(searchUrl, { headers: { "Accept": "application/json" } });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const chemicals = searchData.data || [];

      if (chemicals.length > 0) {
        const chem = chemicals[0];
        results.pharmgkb = {
          id: chem.id,
          name: chem.name,
          url: `https://www.pharmgkb.org/chemical/${chem.id}`,
        };
        results.data_found = true;
        results.sources.pharmgkb = results.pharmgkb.url;

        // 2. Fetch CPIC guidelines for this drug
        try {
          const guidelinesUrl = `https://api.pharmgkb.org/v1/data/guideline?relatedChemicals.id=${chem.id}&view=base`;
          const guidelinesRes = await fetch(guidelinesUrl, { headers: { "Accept": "application/json" } });
          if (guidelinesRes.ok) {
            const guidelinesData = await guidelinesRes.json();
            results.cpic_guidelines = (guidelinesData.data || []).map(g => ({
              name: g.name,
              source: g.source,
              id: g.id,
              url: g.id ? `https://www.pharmgkb.org/guideline/${g.id}` : null,
            }));
          }
        } catch (e) { /* optional */ }

        // 3. Fetch variant annotations
        try {
          const varUrl = `https://api.pharmgkb.org/v1/data/variantAnnotation?relatedChemicals.id=${chem.id}&view=base&pageSize=20`;
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
          }
        } catch (e) { /* optional */ }
      }
    }
  } catch (e) {
    console.error("PharmGKB error:", e.message);
  }

  // 4. CPIC direct API — drug-gene pairs with evidence
  try {
    const cpicUrl = `https://api.cpicpgx.org/v1/pair?drugname=ilike.*${encodeURIComponent(searchTerm)}*&select=drugname,genename,cpicStatus,level,url`;
    const cpicRes = await fetch(cpicUrl, { headers: { "Accept": "application/json" } });
    if (cpicRes.ok) {
      const cpicData = await cpicRes.json();
      results.cpic_pairs = (cpicData || []).map(p => ({
        drug: p.drugname,
        gene: p.genename,
        cpic_level: p.level,        // A/B/C/D — strength of evidence
        cpic_status: p.cpicStatus,  // "CPIC Guideline" / "Informative PGx"
        url: p.url,
      }));
      if (results.cpic_pairs.length > 0) results.data_found = true;
      results.sources.cpic = "https://cpicpgx.org/genes-drugs/";
    }
  } catch (e) {
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
