import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const darkHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.5em', fontWeight: 'bold', color: '#e8e8ec' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: 'bold', color: '#e8e8ec' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: 'bold', color: '#e8e8ec' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: 'bold', color: '#e8e8ec' },
  { tag: t.strong, fontWeight: 'bold', color: '#e8e8ec' },
  { tag: t.emphasis, fontStyle: 'italic', color: '#e8e8ec' },
  { tag: t.link, color: '#58a6ff', textDecoration: 'underline' },
  { tag: t.url, color: '#58a6ff' },
  { tag: t.quote, color: '#8b949e', fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", color: '#ff7b72' },
  { tag: t.list, color: '#7ee787' },
  { tag: t.contentSeparator, color: '#6e7681' },
  { tag: t.meta, color: '#d2a8ff' },
])

export const darkTheme: Extension = [
  EditorView.theme(
    {
      '&': {
        color: '#e8e8ec',
        backgroundColor: 'transparent',
        height: '100%',
        fontSize: 'var(--editor-font-size, 15px)',
      },
      '.cm-scroller': { backgroundColor: 'transparent' },
      '.cm-gutters': { backgroundColor: 'transparent !important' },
      '.cm-content': {
        caretColor: '#e8e8ec',
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        padding: '16px 18px',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#e8e8ec' },
      '&.cm-focused .cm-selectionBackgroundd, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: '#1f4068',
      },
      '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
      '.cm-gutterElement': {
        color: '#6e7681',
      },
      '.cm-searchMatch': { backgroundColor: 'rgba(255, 211, 84, 0.3)' },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(255, 165, 0, 0.5)',
        outline: '1px solid rgba(255, 122, 0, 0.6)',
      },
    },
    { dark: true },
  ),
  syntaxHighlighting(darkHighlight),
]
