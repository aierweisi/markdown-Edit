import type { EditorView } from '@codemirror/view'
import { openSearchPanel } from '@codemirror/search'

export interface FindApi {
  /** Open CodeMirror's built-in search panel (it carries its own next/prev/
   *  replace controls), focusing the query field. */
  open(): void
}

export function attachFind(view: EditorView): FindApi {
  return {
    open() {
      openSearchPanel(view)
    },
  }
}
