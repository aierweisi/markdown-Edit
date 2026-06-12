// Single source of truth for Markdown-like file extensions.
// Used by main (extractFileArg) and renderer (drag/drop filter, file open dialog filter).

export const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'txt'] as const

export const MD_EXTENSION_REGEX = new RegExp(`\\.(${MD_EXTENSIONS.join('|')})$`, 'i')

export function isMdFile(name: string): boolean {
  return MD_EXTENSION_REGEX.test(name)
}

export function stripMdExtension(name: string): string {
  return name.replace(MD_EXTENSION_REGEX, '')
}
