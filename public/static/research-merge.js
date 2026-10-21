/* Companies with the research-driven fields merged in (buy price, sticker price, scores, last researched).
 * The research findings are the source of truth for these; the companies table only holds old values.
 * Every screen that shows a company's Buy Price must go through here (company list, Add Stock, Add Option, stock details). */

function mergeResearchIntoCompanies(companies, researchFindings) {
    return companies.map(company => {
        const research = researchFindings[company.ticker]
        if (!research) return company
        return {
            ...company,
            // Override with research data
            research_score: research.scoresheet_pct,
            anti_fragile_score: research.anti_fragile_total,
            buy_price: research.blended_buy_price,
            sticker_price: research.blended_sticker,
            last_researched: research.last_researched_date,
            // "Wonderful" is driven by research score >= 80
            is_wonderful: research.scoresheet_pct >= 80,
            // Lets the roster filter tell "has a scoresheet" apart from a stale number on the company row
            has_scoresheet: research.scoresheet_pct !== null && research.scoresheet_pct !== undefined
        }
    })
}

// Roster filter. 'scored' = has a research scoresheet; 'wonderful' = scoresheet 80%+ (or the manual star on a company with no research yet).
function filterCompaniesByResearch(companies, filter) {
    if (filter === 'scored') return companies.filter(c => c.has_scoresheet === true)
    if (filter === 'wonderful') return companies.filter(c => !!c.is_wonderful)
    return companies
}

async function fetchCompaniesWithResearch() {
    const response = await api.get('/api/companies')
    const companies = response.data.companies || response.data
    return mergeResearchIntoCompanies(companies, await fetchResearchFindings())
}
