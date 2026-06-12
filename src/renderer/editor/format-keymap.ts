import { keymap, type EditorView } from '@codemirror/view'
import { applyFormat, type FormatAction } from './format-insert'

interface FormatBinding {
  key: string
  action: FormatAction
}

/**
 * Markdown format insertion shortcuts, scoped to the CodeMirror editor so they
 * never fire when modals / panels are focused. "Mod" maps to Cmd on macOS and
 * Ctrl elsewhere.
 */
const BINDINGS: FormatBinding[] = [
  { key: 'Mod-b', action: 'bold' },
  { key: 'Mod-i', action: 'italic' },
  { key: 'Mod-k', action: 'link' },
  { key: 'Mod-Shift-i', action: 'image' },
  { key: 'Mod-`', action: 'code' },
  { key: 'Mod-Shift-c', action: 'codeblock' },
  { key: 'Mod-Shift-x', action: 'strikethrough' },
  { key: 'Mod-Shift-.', action: 'quote' },
  { key: 'Mod-Shift-7', action: 'ol' },
  { key: 'Mod-Shift-8', action: 'ul' },
  { key: 'Mod-Alt-t', action: 'table' },
  { key: 'Mod-Alt-h', action: 'heading' },
  { key: 'Mod-Alt-r', action: 'hr' },
]

export const formatKeymap = keymap.of(
  BINDINGS.map(({ key, action }) => ({
    key,
    preventDefault: true,
    run(view: EditorView): boolean {
      applyFormat(view, action)
      return true
    },
  })),
)
