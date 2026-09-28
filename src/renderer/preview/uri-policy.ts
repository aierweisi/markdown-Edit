/**
 * DOMPurify `ALLOWED_URI_REGEXP` for the preview: a URI attribute value that
 * fails this test is stripped during sanitization (e.g. an `<img src>` becomes
 * empty), so the rule must accept every legitimate local reference or images
 * silently stop rendering.
 *
 * Custom (not DOMPurify's default) because the default whitelist only allows
 * http(s)/mailto/…, which would drop the renderer's `file:///` images and
 * relative asset paths.
 *
 * Accepted shapes:
 *  - a known safe scheme followed by `:`           → https:, file:, mailto:, …
 *  - `data:image/…` (base64-embedded images; `data:` at large stays rejected —
 *    `data:text/html` is an XSS vector) and `blob:` (opaque session URLs)
 *  - a value that does NOT start with a letter      → `/abs`, `./rel`, `#frag` (the
 *                                                     leading char itself matches `[^a-z]`)
 *  - a letter/dot/plus/hyphen run NOT followed by `:` → `a.png`, `assets/x.png`
 *
 * The third alternative is what lets relative paths containing a directory
 * (`assets/x.png`) through. Its negated class MUST keep the hyphen literal
 * (escaped `\-` or placed at a class edge): an unescaped `.-:` is parsed as a
 * range (U+002E `.` … U+003A `:`) that includes `/` and the digits, which makes
 * every `dir/file` path fail the test so DOMPurify strips the src and the image
 * never renders. This is exactly the bug fixed by escaping the hyphen below.
 *
 * Rejected: `javascript:`, `vbscript:`, and any other `scheme:` not whitelisted.
 */
export const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|cid|xmpp):|data:image\/|blob:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
