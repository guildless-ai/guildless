const capabilityCatalog = require('./public_apis_catalog')
const adapterBuilder = require('./adapter_builder')
const registryApi = require('./registry')

async function acquireCapability({ capability, goal, catalog, registryPath, candidate, verification, testResult, fetchImpl }) {
  const resolved = capabilityCatalog.resolveCapabilities({ goal: goal || capability || '', catalog })
  const resolvedCapability = resolved.capabilities.find(item => item.capability === capability) || resolved.capabilities[0]
  const selected = candidate || resolvedCapability?.providers?.flatMap(provider => provider.candidates || [])[0] || null
  if (!selected) return { stage: 'search', registered: false, reason: 'no_candidate', resolved }

  const verified = await capabilityCatalog.verifyCandidate({ ...selected, verification }, fetchImpl)
  if (!verified.verified) return { stage: 'verify', registered: false, reason: 'verification_incomplete', candidate: verified, resolved }

  const proposal = adapterBuilder.buildAdapterProposal({ capability: capability || resolvedCapability?.capability, candidate: verified })
  if (testResult?.passed !== true) return { stage: 'test', registered: false, reason: 'adapter_test_required', candidate: verified, proposal, resolved }

  const entry = registryApi.registerVerifiedCapability(registryPath, {
    capability: capability || resolvedCapability?.capability,
    provider: verified.name,
    source: verified.source,
    docs_url: verified.docs_url,
    adapter_path: proposal.adapter_path,
    tests: [...proposal.tests, ...(testResult.tests || [])],
    verification: { ...verified.verification, test_request: true },
  })
  return { stage: entry.registered ? 'registered' : 'registry_rejected', ...entry, candidate: verified, proposal, resolved }
}

module.exports = { acquireCapability }
