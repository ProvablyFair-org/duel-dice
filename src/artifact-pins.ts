/**
 * ARTIFACTS OF RECORD — pinned.
 *
 * These files are shipped as evidence and their figures are quoted in the report, but until this
 * pin existed nothing hashed them: emptying, duplicating or shrinking any of them left the
 * verifier reporting PROVABLY FAIR — Full Pass, exit 0. A published artifact that nothing can
 * distinguish from a rewritten one is not evidence.
 *
 * outputs/verification-results.json is deliberately NOT pinned — it is this verifier's own
 * output and is rewritten on every run by construction.
 *
 * Regenerating an artifact legitimately means re-pinning it here, in the same commit, with the
 * run that produced it.
 */
export const ARTIFACT_PINS: Readonly<Record<string, string>> = Object.freeze({
  'chi-squared-results.json':
    'bc361f781aeefc4ba3d1d534a24ef347d3159b5a7509a6768be7d3ffc5ca9179',
  'determinism-log.json':
    '7962295985266c80e5fd15d4c4397fdb3a167b5f2ef7210e3b534dcd49ded299',
  'rtp-convergence.html':
    'f0b238533179f09935f2184870b2c1388f654963e46cf18682f2132e85800efa',
  'simulation-results.json':
    '22ad777ff74cfb19e1304f6378c025a6e50cacc6c1404fbceb81529894b8f704',
});
