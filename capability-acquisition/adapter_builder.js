function safeSlug(value) {
  return String(value || 'capability').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80)
}

function buildAdapterProposal({ capability, candidate }) {
  const slug = safeSlug(capability || candidate?.name)
  return {
    schema_version: 1,
    status: 'needs_codex_generation',
    capability: capability || 'unknown',
    provider: candidate?.name || 'unknown',
    source: candidate?.source || 'unknown',
    adapter_path: `generated/${slug}.py`,
    secret_ref: `capability.${slug}.api_key`,
    interface: { input: 'structured capability request', output: 'structured capability result', external_side_effects: 'disabled until approval' },
    tests: [
      'configuration is read from Secret Store reference only',
      'HTTPS is required for external requests',
      'timeout and rate-limit errors are returned as typed failures',
      'raw credentials and full responses are excluded from audit logs',
    ],
    evidence_required_before_generation: ['official docs URL', 'authentication method', 'commercial use terms', 'rate limit', 'test request result'],
    candidate_verified: candidate?.verified === true,
  }
}

module.exports = { buildAdapterProposal }
