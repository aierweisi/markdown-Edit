import { describe, expect, it } from 'vitest'
import { defaults, migrateStore } from '../src/main/store-schema'
import type { StoreSchema } from '../src/shared/ipc'

/**
 * Minimal in-memory Store stub matching the shape migrateStore depends on.
 * electron-store's real API has more methods but migrateStore only uses
 * get/set/has/delete from the typed surface.
 */
function makeFakeStore(initial: Record<string, unknown>): {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K]
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void
  has(key: string): boolean
  delete(key: string): void
  data: Record<string, unknown>
} {
  const data: Record<string, unknown> = { ...initial }
  return {
    data,
    get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
      const v = data[key as string]
      return (v ?? defaults[key]) as StoreSchema[K]
    },
    set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) {
      data[key as string] = value
    },
    has(key: string) {
      return key in data
    },
    delete(key: string) {
      delete data[key]
    },
  }
}

describe('store migration', () => {
  it('migrates tpl_v2 → templates when templates is empty', () => {
    const fake = makeFakeStore({
      tpl_v2: [{ id: 't1', name: 'Old', icon: '📝', content: 'hi', createdAt: 1 }],
    })
    migrateStore(fake as never)
    expect(fake.data.templates).toEqual([
      { id: 't1', name: 'Old', icon: '📝', content: 'hi', createdAt: 1 },
    ])
    expect(fake.data.tpl_v2).toBeUndefined()
  })

  it('does not overwrite existing templates when tpl_v2 exists', () => {
    const fake = makeFakeStore({
      tpl_v2: [{ id: 'old', name: 'X', icon: '', content: '', createdAt: 0 }],
      templates: [{ id: 'new', name: 'Y', icon: '', content: '', createdAt: 0 }],
    })
    migrateStore(fake as never)
    expect((fake.data.templates as Array<{ id: string }>)[0].id).toBe('new')
    expect(fake.data.tpl_v2).toBeUndefined()
  })

  it('drops legacy pending-file keys', () => {
    const fake = makeFakeStore({
      _pendingOpenFile: '/x/y.md',
      _pendingOSFile: true,
    })
    migrateStore(fake as never)
    expect(fake.data._pendingOpenFile).toBeUndefined()
    expect(fake.data._pendingOSFile).toBeUndefined()
  })

  it('backfills new defaults when absent', () => {
    const fake = makeFakeStore({})
    migrateStore(fake as never)
    expect(fake.data.dividerPos).toBe(defaults.dividerPos)
    expect(fake.data.imageSaveDir).toBe(defaults.imageSaveDir)
    expect(fake.data.tabOrder).toEqual(defaults.tabOrder)
  })

  it('preserves existing values for new keys', () => {
    const fake = makeFakeStore({
      dividerPos: 0.4,
      imageSaveDir: 'images',
      tabOrder: ['a', 'b'],
    })
    migrateStore(fake as never)
    expect(fake.data.dividerPos).toBe(0.4)
    expect(fake.data.imageSaveDir).toBe('images')
    expect(fake.data.tabOrder).toEqual(['a', 'b'])
  })
})
