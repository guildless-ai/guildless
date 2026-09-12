const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { verifyCandidate } = require('./public_apis_catalog')
const { acquireCapability } = require('./acquisition_pipeline')

async function main() {
  const fetchImpl = async () => ({ ok: true, status: 200 })
  const candidate = { name: 'Test Provider', source: 'test', docs_url: 'https://example.test/docs' }
  const incomplete = await verifyCandidate(candidate, fetchImpl)
  assert.equal(incomplete.verified, false)

  const registryPath = path.join(os.tmpdir(), `guildless-capability-test-${Date.now()}.json`)
  const result = await acquireCapability({
    capability: 'email_validation',
    goal: '営業',
    catalog: { entries: [] },
    registryPath,
    candidate,
    verification: {
      authentication: 'none', commercial_use: true, free_tier: true,
      rate_limit: '100/day', test_request: true, evidence: ['official docs: pricing and terms'],
    },
    testResult: { passed: true, tests: ['adapter smoke'] },
    fetchImpl,
  })
  assert.equal(result.registered, true)
  assert.equal(result.entry.status, 'ready')
  fs.rmSync(registryPath, { force: true })
  console.log(JSON.stringify({ ok: true, stage: result.stage, registered: result.registered }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
