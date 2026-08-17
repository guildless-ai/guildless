const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const SOURCE_URL = 'https://github.com/public-apis/public-apis'

function splitRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim())
}

function linkValue(value) {
  const match = String(value || '').match(/^\[([^\]]+)\]\(([^)]+)\)/)
  return match ? { name: match[1].trim(), url: match[2].trim() } : { name: String(value || '').trim(), url: '' }
}

function parsePublicApis(markdown) {
  const entries = []
  let category = ''
  let header = null
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trim()
    const categoryMatch = line.match(/^###\s+(.+)$/)
    if (categoryMatch) { category = categoryMatch[1].trim(); header = null; continue }
    if (!line.startsWith('|') && !/^API\s*\|/i.test(line)) continue
    const cells = splitRow(line)
    if (!header && cells.some(cell => /^API$/i.test(cell))) { header = cells.map(cell => cell.toLowerCase()); continue }
    if (!header || /^\|?\s*:?-+/.test(line)) continue
    const apiIndex = header.findIndex(cell => cell === 'api')
    const descriptionIndex = header.findIndex(cell => cell === 'description')
    const authIndex = header.findIndex(cell => cell === 'auth')
    const httpsIndex = header.findIndex(cell => cell === 'https')
    const corsIndex = header.findIndex(cell => cell === 'cors')
    if (apiIndex < 0 || descriptionIndex < 0) continue
    const api = linkValue(cells[apiIndex])
    if (!api.name || !api.url) continue
    entries.push({
      id: `public-apis:${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${api.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${entries.length}`,
      name: api.name,
      category,
      description: cells[descriptionIndex] || '',
      auth_type: cells[authIndex] || 'Unknown',
      https: cells[httpsIndex] || 'Unknown',
      cors: cells[corsIndex] || 'Unknown',
      docs_url: api.url,
      source: 'public-apis',
      source_url: SOURCE_URL,
      verified: false,
      verification: { alive: null, commercial_use: null, free_tier: null, rate_limit: null, checked_at: null },
    })
  }
  return entries
}

function indexMarkdown(readmePath, outputPath) {
  const markdown = fs.readFileSync(readmePath, 'utf8')
  const entries = parsePublicApis(markdown)
  const payload = {
    schema_version: 1,
    source: 'public-apis/public-apis',
    source_url: SOURCE_URL,
    indexed_at: new Date().toISOString(),
    readme_sha256: crypto.createHash('sha256').update(markdown).digest('hex'),
    count: entries.length,
    entries,
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

function readCatalog(catalogPath) {
  try { return JSON.parse(fs.readFileSync(catalogPath, 'utf8')) } catch { return { entries: [], count: 0 } }
}

function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9ぁ-んァ-ン一-龥]+/).filter(Boolean)
}

function searchPublicApis(catalog, query, limit = 12) {
  const terms = tokens(query)
  if (!terms.length) return []
  return (catalog.entries || []).map(entry => {
    const haystack = tokens([entry.name, entry.category, entry.description].join(' '))
    const hits = terms.filter(term => haystack.some(token => token.includes(term) || term.includes(token)))
    return { entry, score: hits.length / terms.length + (entry.https === 'Yes' ? 0.05 : 0) }
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(result => ({ ...result.entry, match_score: Number(result.score.toFixed(3)) }))
}

function deriveCapabilityNeeds(goal) {
  const text = String(goal || '').toLowerCase()
  const needs = new Set(['market_research'])
  if (/営業|sales|顧客|リード|b2b|商談|売上|revenue/.test(text)) ['company_lookup', 'email_validation', 'email_send'].forEach(x => needs.add(x))
  if (/旅行|travel|航空|flight|ホテル|hotel|地図|map|天気|weather/.test(text)) ['flight_search', 'geocoding', 'weather'].forEach(x => needs.add(x))
  if (/動画|youtube|tiktok|content|コンテンツ/.test(text)) ['video', 'social', 'analytics'].forEach(x => needs.add(x))
  if (/求人|採用|job|hiring/.test(text)) ['jobs', 'company_lookup', 'geocoding'].forEach(x => needs.add(x))
  if (/金融|finance|為替|currency|株|crypto|決済|payment/.test(text)) ['finance', 'currency_exchange', 'payments'].forEach(x => needs.add(x))
  if (/security|セキュリティ|脆弱|監査/.test(text)) ['security_scan', 'data_validation'].forEach(x => needs.add(x))
  return [...needs]
}

function resolveCapabilities({ goal, catalog }) {
  const needs = deriveCapabilityNeeds(goal)
  const capabilities = needs.map(capability => {
    const queries = {
      market_research: 'business news open data', company_lookup: 'business company lookup', email_validation: 'email validation data validation', email_send: 'email business',
      flight_search: 'transportation flight', geocoding: 'geocoding maps', weather: 'weather', video: 'video', social: 'social', analytics: 'business analytics',
      jobs: 'jobs', finance: 'finance', currency_exchange: 'currency exchange', payments: 'business payments', security_scan: 'security anti-malware', data_validation: 'data validation',
    }
    return {
      capability,
      status: 'gap',
      providers: [
        { source: 'local', status: 'not_found', candidates: [] },
        { source: 'github', status: 'candidate_search', candidates: [] },
        { source: 'public-apis', status: 'candidate', candidates: searchPublicApis(catalog, queries[capability] || capability, 6) },
        { source: 'npm', status: 'candidate_search', candidates: [] },
        { source: 'pypi', status: 'candidate_search', candidates: [] },
        { source: 'hugging-face', status: 'candidate_search', candidates: [] },
        { source: 'mcp', status: 'candidate_search', candidates: [] },
        { source: 'browser', status: 'fallback', candidates: [] },
      ],
      selected: null,
      selection_reason: '候補は未検証。公式情報・生存・認証・料金・商用条件・rate limit確認後に選択します。',
    }
  })
  return { schema_version: 1, goal, generated_at: new Date().toISOString(), needs, capabilities, policy: 'discover_only_until_verified' }
}

async function verifyCandidate(candidate, fetchImpl = globalThis.fetch) {
  const checkedAt = new Date().toISOString()
  const declared = candidate?.verification && typeof candidate.verification === 'object' ? candidate.verification : {}
  if (!candidate?.docs_url || !/^https:\/\//i.test(candidate.docs_url)) return { ...candidate, verified: false, verification: { ...declared, alive: false, reason: 'https_docs_required', checked_at: checkedAt } }
  try {
    const response = await fetchImpl(candidate.docs_url, { method: 'HEAD', redirect: 'follow' })
    const verification = { ...declared, alive: response.ok, status: response.status, checked_at: checkedAt, note: 'all fields must be evidenced before registry registration' }
    const complete = verification.alive === true && Boolean(verification.authentication) && verification.commercial_use === true && typeof verification.free_tier === 'boolean' && Boolean(verification.rate_limit) && verification.test_request === true && Array.isArray(verification.evidence) && verification.evidence.length > 0
    return { ...candidate, verified: complete, verification }
  } catch (error) {
    return { ...candidate, verified: false, verification: { ...declared, alive: false, error: String(error.message || error), checked_at: checkedAt } }
  }
}

module.exports = { SOURCE_URL, parsePublicApis, indexMarkdown, readCatalog, searchPublicApis, deriveCapabilityNeeds, resolveCapabilities, verifyCandidate }
