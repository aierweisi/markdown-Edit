import type { EditorView } from '@codemirror/view'
import {
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search'

export interface FindApi {
  open(replaceMode?: boolean): void
  close(): void
  next(): void
  prev(): void
  replaceOne(): void
  replaceAll(): void
}

export function attachFind(view: EditorView): FindApi {
  return {
    open() {
      openSearchPanel(view)
    },
    close() {
      closeSearchPanel(view)
    },
    next() {
      findNext(view)
    },
    prev() {
      findPrevious(view)
    },
    replaceOne() {
      replaceNext(view)
    },
    replaceAll() {
      replaceAll(view)
    },
  }
}
