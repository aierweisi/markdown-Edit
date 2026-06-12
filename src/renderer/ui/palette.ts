import { fuzzyFilter } from '../lib/fuzzy'

export interface PaletteCommand {
  id: string
  group: string
  title: string
  hint?: string
  run(): void | Promise<void>
}

export interface PaletteApi {
  register(cmd: PaletteCommand): void
  unregister(id: string): void
  open(): void
  close(): void
}

export function createPalette(): PaletteApi {
  const commands = new Map<string, PaletteCommand>()
  let overlay: HTMLElement | null = null
  let input: HTMLInputElement | null = null
  let list: HTMLElement | null = null
  let selected = 0
  let lastFiltered: PaletteCommand[] = []

  function build(): void {
    overlay = document.createElement('div')
    overlay.className = 'palette-overlay'
    overlay.innerHTML = `
      <div class="palette">
        <input class="palette__input" type="text" placeholder="输入命令…" />
        <div class="palette__list"></div>
      </div>`
    document.body.appendChild(overlay)
    input = overlay.querySelector<HTMLInputElement>('.palette__input')
    list = overlay.querySelector<HTMLElement>('.palette__list')

    input?.addEventListener('input', refresh)
    input?.addEventListener('keydown', onKey)
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) close()
    })
    list?.addEventListener('click', (evt) => {
      const t = (evt.target as HTMLElement).closest<HTMLElement>('[data-cmd-id]')
      if (!t) return
      const id = t.dataset.cmdId
      if (!id) return
      run(id)
    })
  }

  function refresh(): void {
    if (!input || !list) return
    const filtered = fuzzyFilter(Array.from(commands.values()), input.value, (c) =>
      `${c.group} ${c.title} ${c.hint ?? ''}`,
    )
    lastFiltered = filtered.map((f) => f.item)
    selected = 0
    list.innerHTML = filtered
      .slice(0, 50)
      .map(
        ({ item }, i) =>
          `<div class="palette__item${i === 0 ? ' palette__item--active' : ''}" data-cmd-id="${
            item.id
          }">
            <span class="palette__group">${item.group}</span>
            <span class="palette__title">${item.title}</span>
            ${item.hint ? `<span class="palette__hint">${item.hint}</span>` : ''}
          </div>`,
      )
      .join('')
  }

  function moveSelection(delta: number): void {
    if (!list) return
    const items = list.querySelectorAll<HTMLElement>('.palette__item')
    if (items.length === 0) return
    items[selected]?.classList.remove('palette__item--active')
    selected = (selected + delta + items.length) % items.length
    items[selected]?.classList.add('palette__item--active')
    items[selected]?.scrollIntoView({ block: 'nearest' })
  }

  function onKey(evt: KeyboardEvent): void {
    if (evt.key === 'Escape') {
      close()
      return
    }
    if (evt.key === 'ArrowDown') {
      evt.preventDefault()
      moveSelection(1)
      return
    }
    if (evt.key === 'ArrowUp') {
      evt.preventDefault()
      moveSelection(-1)
      return
    }
    if (evt.key === 'Enter') {
      evt.preventDefault()
      const target = lastFiltered[selected]
      if (target) run(target.id)
    }
  }

  function run(id: string): void {
    const cmd = commands.get(id)
    if (!cmd) return
    close()
    void cmd.run()
  }

  function open(): void {
    if (!overlay) build()
    overlay!.classList.add('palette-overlay--open')
    if (input) {
      input.value = ''
      refresh()
      input.focus()
    }
  }

  function close(): void {
    overlay?.classList.remove('palette-overlay--open')
  }

  return {
    register(cmd) {
      commands.set(cmd.id, cmd)
    },
    unregister(id) {
      commands.delete(id)
    },
    open,
    close,
  }
}
