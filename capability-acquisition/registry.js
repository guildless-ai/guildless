const fs = require('node:fs')
const path = require('node:path')

function readRegistry(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return { schema_version: 1, entries: Array.isArray(value.entries) ? value.entries : [] }
  } catch {
    return { schema_version: 1, entries: [] }
  }
}

function writeRegistry(filePath, registry) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), 'utf8')
  fs.renameSync(tempPath, filePath)
  return registry
}

function registerVerifiedCapability(filePath, input) {
  const verification = input?.verification || {}
  const required = [
    ['alive', verification.alive === true],
    ['authentication', Boolean(verification.authentication)],
    ['commercial_use', verification.commercial_use === true],
    ['free_tier', typeof verification.free_tier === 'boolean'],
    ['rate_limit', Boolean(verification.rate_limit)],
    ['test_request', verification.test_request === true],
    ['evidence', Array.isArray(verification.evidence) && verification.evidence.length > 0],
  ]
  const missing = required.filter(([, ok]) => !ok).map(([name]) => name)
  if (missing.length) return { registered: false, missing, registry: readRegistry(filePath) }
  const registry = readRegistry(filePath)
  const entry = {
    id: input.id || `${input.capability || 'capability'}:${input.provider || 'provider'}`,
    capability: input.capability || 'unknown',
    provider: input.provider || 'unknown',
    source: input.source || 'unknown',
    docs_url: input.docs_url || '',
    adapter_path: input.adapter_path || '',
    tests: input.tests || [],
    verification: {
      ...verification,
      checked_at: verification.checked_at || new Date().toISOString(),
    },
    registered_at: new Date().toISOString(),
    status: 'ready',
  }
  const index = registry.entries.findIndex(item => item.id === entry.id)
  if (index >= 0) registry.entries[index] = entry
  else registry.entries.push(entry)
  writeRegistry(filePath, registry)
  return { registered: true, missing: [], entry, registry }
}

module.exports = { readRegistry, writeRegistry, registerVerifiedCapability }
