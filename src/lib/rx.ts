/** Unicode-aware word boundary (JS `\b` is ASCII-only, which breaks "água", "café", "amanhã"). */
const W = String.raw`[\p{L}\p{N}_]`
const B = `(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`

/** Build a regex where `\b` means a unicode word boundary. Always case-insensitive + unicode. */
export function rx(source: string | RegExp, extraFlags = ''): RegExp {
  const src = typeof source === 'string' ? source : source.source
  return new RegExp(src.replaceAll(String.raw`\b`, B), 'iu' + extraFlags)
}

/** Accent/case-insensitive normalization for search & dedupe. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}
