export function estimateTokensFromStrings(...chunks: (string | undefined)[]): number {
  let n = 0
  for (const c of chunks) {
    if (typeof c === 'string' && c.length > 0) n += c.length
  }
  return Math.max(0, Math.round(n / 4))
}
