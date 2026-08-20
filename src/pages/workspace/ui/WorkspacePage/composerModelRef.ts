import { STORAGE_KEYS } from '@/shared/config/storageKeys'

export function loadComposerModelRefFromLs(): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEYS.composerModelRef)
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}