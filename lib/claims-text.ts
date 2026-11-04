// Flattens Patent.claimsJson into plain text for the searchable Patent.claimsText column.
// claimsJson is either [{ claim_sequence, claim_text }] or a plain string[].
export function claimsToText(claimsJson: unknown): string | null {
  if (!Array.isArray(claimsJson) || claimsJson.length === 0) return null
  const text = claimsJson
    .map((c: any) => (typeof c === 'string' ? c : c?.claim_text ?? '').trim())
    .filter(Boolean)
    .join('\n')
  return text || null
}
