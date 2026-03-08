# Open Drug Trials

Real pharmacogenomics and clinical trial data for underrepresented populations.

**Live data from:**
- [PharmGKB](https://www.pharmgkb.org) — gene-drug associations, no API key required
- [CPIC](https://cpicpgx.org) — clinical dosing guidelines, no API key required  
- [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) — trial registry, no API key required

**Claude's only role:** Extract structured search parameters (sex, age, ancestry keywords) from free-text identity descriptions. No scoring. No ranking. No fabrication.

---

## Architecture

```
api/parse-identity.js   →  Claude (identity → structured params only)
api/pharmgkb.js         →  PharmGKB + CPIC (real data, no LLM)
api/trials.js           →  ClinicalTrials.gov (real data, no LLM)
src/App.js              →  React frontend
```

## Deploy to Vercel

1. Create new GitHub repo and push this folder
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy

That's it. No database. No auth. No infrastructure.

## What each engine shows

**Engine 1 — PharmGKB**
- CPIC gene-drug pairs with evidence level (A/B/C/D)
- Clinical dosing guidelines
- Count of variant studies that included your ancestry group (real number from PharmGKB, not estimated)

**Engine 2 — Research Diversity**
- Race/ethnicity breakdown from completed trial results on ClinicalTrials.gov
- Only shown where trials actually reported demographics
- Absence of data is surfaced as a finding, not hidden

**Engine 3 — Trial Matching**
- Live recruiting trials filtered by sex, age, keywords
- Keyword matches shown verbatim (exact string from eligibility text)
- Direct link to ClinicalTrials.gov for each trial

## License

MIT — open source, fork freely.
