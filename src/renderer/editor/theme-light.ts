import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const lightHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.5em', fontWeight: 'bold', color: '#1c1e21' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: 'bold', color: '#1c1e21' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: 'bold', color: '#1c1e21' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: 'bold', color: '#1c1e21' },
  { tag: t.strong, fontWeight: 'bold', color: '#1c1e21' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#1c1e21' },
  { tag: t.link, color: '#0366d6', textDecoration: 'underline' },
  { tag: t.url, color: '#0366d6' },
  { tag: t.quote, color: '#6a737d', fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", color: '#d73a49' },
  { tag: t.list, color: '#22863a' },
  { tag: t.contentSeparator, color: '#959da5' },
  { tag: t.meta, color: '#6f42c1' },
])

export const lightTheme: Extension = [
  EditorView.theme(
    {
      '&': {
        color: '#1c1e21',
        backgroundColor: 'transparent',
        height: '100%',
        fontSize: 'var(--editor-font-size, 15px)',
      },
      '.cm-scroller': { backgroundColor: 'transparent' },
      '.cm-gutters': { backgroundColor: 'transparent !important' },
      '.cm-content': {
        caretColor: '#1c1e21',
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        padding: '16px 18px',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#1c1e21' },
      '&.cm-focused .cm-selectionBackgroundd, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: '#b5d6ff',
      },
      '.cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(0, 0, 0, 0.03)' },
      '.cm-gutterElement': {
        color: '#959da5',
      },
      '.cm-searchMatch': { backgroundColor: 'rgba(255, 211, 84, 0.45)' },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(255, 165, 0, 0.6)',
        outline: '1px solid rgba(255, 122, 0, 0.7)',
      },
    },
    { dark: false },
  ),
  syntaxHighlighting(lightHighlight),
]
