function countHits(text: string, keywords: string[]): number {
  const t = String(text || '')
  let hits = 0
  for (const k of keywords) {
    const kk = String(k || '').trim()
    if (!kk) continue
    if (t.includes(kk)) hits += 1
  }
  return hits
}

export function scoreBucket(args: { text: string; tags: string[]; keywords: string[] }): 0 | 1 | 2 | 3 {
  const keywords = Array.isArray(args.keywords) ? args.keywords : []
  const textHits = countHits(args.text, keywords)
  const tagHits = countHits((Array.isArray(args.tags) ? args.tags : []).join(' '), keywords)
  const hits = textHits + tagHits
  if (hits <= 0) return 0
  if (hits === 1) return 1
  if (hits === 2) return 2
  return 3
}

