/**
 * GitHub-style slug used for heading anchors and generated TOC links. This is
 * the SINGLE source of truth — both the markdown worker (rendering
 * `<hN id="…">`) and the TOC inserter (emitting `[text](#slug)`) call it, so
 * preview anchors always match the links TOC produces.
 *
 * Pure (DOM-free) so it is safe to import from the worker.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/[`*_~]/g, '') // strip emphasis / code marks
    .replace(/[^\w一-龥\s-]/g, '') // keep word chars, CJK, space, hyphen
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
