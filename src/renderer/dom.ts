// One-time typed DOM reference collection. Phase 7 fills index.html with the
// real elements; this module centralizes lookups so hot paths never call
// document.getElementById per event.

export interface DomRefs {
  body: HTMLBodyElement
  // Editor + preview layout
  mainArea: HTMLElement | null
  editorPane: HTMLElement | null
  editorContainer: HTMLElement | null
  previewPane: HTMLElement | null
  previewContainer: HTMLElement | null
  previewBody: HTMLElement | null
  divider: HTMLElement | null
  // Toolbars
  toolbar: HTMLElement | null
  formatToolbar: HTMLElement | null
  // Tabs
  tabbar: HTMLElement | null
  tabsContainer: HTMLElement | null
  tabNewBtn: HTMLButtonElement | null
  // Window controls
  winMinBtn: HTMLButtonElement | null
  winMaxBtn: HTMLButtonElement | null
  winMaxIcon: SVGElement | null
  winCloseBtn: HTMLButtonElement | null
  // Status bar
  statusFile: HTMLElement | null
  statusModified: HTMLElement | null
  statusCursor: HTMLElement | null
  statusSelection: HTMLElement | null
  statusReadtime: HTMLElement | null
  statusChars: HTMLElement | null
  statusAutosave: HTMLElement | null
  statusPaletteHint: HTMLElement | null
  wordCount: HTMLElement | null
  // Welcome
  welcomeOverlay: HTMLElement | null
  // Find
  findPanel: HTMLElement | null
  findInput: HTMLInputElement | null
  findCount: HTMLElement | null
  replaceInput: HTMLInputElement | null
  // Modals
  settingsOverlay: HTMLElement | null
  tplOverlay: HTMLElement | null
  restoreOverlay: HTMLElement | null
}

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

function $svg(id: string): SVGElement | null {
  const el = document.getElementById(id)
  return el instanceof SVGElement ? el : null
}

export function collectDomRefs(): DomRefs {
  return {
    body: document.body as HTMLBodyElement,
    mainArea: $('main-area'),
    editorPane: $('editor-pane'),
    editorContainer: $('editor-container'),
    previewPane: $('preview-pane'),
    previewContainer: $('preview-container'),
    previewBody: $('preview-body'),
    divider: $('divider'),
    toolbar: $('toolbar'),
    formatToolbar: $('format-toolbar'),
    tabbar: $('tabbar'),
    tabsContainer: $('tabs-container'),
    tabNewBtn: $<HTMLButtonElement>('btn-tab-new'),
    winMinBtn: $<HTMLButtonElement>('win-min'),
    winMaxBtn: $<HTMLButtonElement>('win-max'),
    winMaxIcon: $svg('win-max-icon'),
    winCloseBtn: $<HTMLButtonElement>('win-close'),
    statusFile: $('status-file'),
    statusModified: $('status-modified'),
    statusCursor: $('status-cursor'),
    statusSelection: $('status-selection'),
    statusReadtime: $('status-readtime'),
    statusChars: $('status-chars'),
    statusAutosave: $('status-autosave'),
    statusPaletteHint: $('status-palette-hint'),
    wordCount: $('word-count'),
    welcomeOverlay: $('welcome-overlay'),
    findPanel: $('find-panel'),
    findInput: $<HTMLInputElement>('find-input'),
    findCount: $('find-count'),
    replaceInput: $<HTMLInputElement>('replace-input'),
    settingsOverlay: $('settings-overlay'),
    tplOverlay: $('tpl-overlay'),
    restoreOverlay: $('restore-overlay'),
  }
}
