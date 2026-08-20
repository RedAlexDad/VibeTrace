import { useEffect, useMemo, useRef, useState } from 'react'
import type { OcComposerModelOption } from '@/shared/api/opencodeApi'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'

function providerOf(ref: string): string {
  return ref.includes('/') ? ref.split('/')[0]! : 'Other'
}

/** Free models exposed by opencode: ref/label contains "free". */
function isFreeModel(o: OcComposerModelOption): boolean {
  return /free|contributor/i.test(o.ref) || /free/i.test(o.label)
}

/** Local models (ollama / local providers). */
function isLocalModel(o: OcComposerModelOption): boolean {
  const p = providerOf(o.ref)
  return p === 'ollama' || /local/i.test(o.label) || /localhost/i.test(o.ref)
}

function loadFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.favoriteModels)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export default function ModelPicker({
  value = '',
  options = [],
  loading = false,
  disabled = false,
  onChange,
}: {
  value: string
  options: OcComposerModelOption[]
  loading?: boolean
  disabled?: boolean
  onChange?: (ref: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.favoriteModels, JSON.stringify(favorites))
    } catch {
      /* ignore */
    }
  }, [favorites])

  const toggleFavorite = (ref: string) => {
    setFavorites((prev) => (prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]))
  }

  const favoriteOptions = useMemo(() => {
    const byRef = new Map(options.map((o) => [o.ref, o]))
    return favorites.map((r) => byRef.get(r)).filter((o): o is OcComposerModelOption => !!o)
  }, [favorites, options])

  const freeOptions = useMemo(() => options.filter(isFreeModel), [options])
  const localOptions = useMemo(() => options.filter(isLocalModel), [options])
  const groupOptions = useMemo(
    () => options.filter((o) => !isFreeModel(o) && !isLocalModel(o)),
    [options],
  )

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? groupOptions.filter(
          (o) => o.ref.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
        )
      : groupOptions
    const map = new Map<string, OcComposerModelOption[]>()
    for (const o of filtered) {
      const p = providerOf(o.ref)
      const arr = map.get(p) ?? []
      arr.push(o)
      map.set(p, arr)
    }
    return [...map.entries()]
  }, [groupOptions, query])

  const currentLabel =
    options.find((o) => o.ref === value)?.label || (value ? value : 'Default model')

  const renderRow = (o: OcComposerModelOption) => {
    const isFav = favorites.includes(o.ref)
    return (
      <div
        key={o.ref}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 6,
          background: o.ref === value ? 'var(--color-accent-soft)' : 'transparent',
        }}
      >
        <button
          type="button"
          onClick={() => {
            onChange?.(o.ref)
            setOpen(false)
            setQuery('')
          }}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            padding: '6px 4px 6px 10px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            color: o.ref === value ? 'var(--color-accent-deep)' : 'var(--color-text-primary)',
            fontFamily: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {o.label}
        </button>
        <button
          type="button"
          onClick={() => toggleFavorite(o.ref)}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 5,
            color: isFav ? 'var(--color-warning)' : 'var(--color-text-muted)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={isFav ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || loading}
        title="Model"
        style={{
          fontSize: 11,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border-light)',
          background: 'var(--color-bg-white)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          maxWidth: 240,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {loading ? 'Loading…' : currentLabel}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-tertiary)"
          strokeWidth="2"
          style={{ flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: 'min(680px, 92vw)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-bg-white)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderBottom: '1px solid var(--color-border-light)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Select model
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {options.length} available
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
                Esc to close
              </span>
            </div>

            <div style={{ padding: '8px 14px', flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 12,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-white)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
              <button
                type="button"
                onClick={() => {
                  onChange?.('')
                  setOpen(false)
                  setQuery('')
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: value === '' ? 'var(--color-accent-soft)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                }}
              >
                Default model
              </button>

              {!query.trim() && favoriteOptions.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      color: 'var(--color-text-tertiary)',
                      padding: '8px 10px 3px',
                    }}
                  >
                    Favorite · {favoriteOptions.length}
                  </div>
                  {favoriteOptions.map(renderRow)}
                </div>
              )}

              {!query.trim() && freeOptions.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      color: 'var(--color-success)',
                      padding: '8px 10px 3px',
                    }}
                  >
                    Free (opencode) · {freeOptions.length}
                  </div>
                  {freeOptions.map(renderRow)}
                </div>
              )}

              {!query.trim() && localOptions.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      color: 'var(--color-accent-strong)',
                      padding: '8px 10px 3px',
                    }}
                  >
                    Local · {localOptions.length}
                  </div>
                  {localOptions.map(renderRow)}
                </div>
              )}

              {groups.map(([provider, opts]) => (
                <div key={provider}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      color: 'var(--color-text-tertiary)',
                      padding: '8px 10px 3px',
                    }}
                  >
                    {provider} · {opts.length}
                  </div>
                  {opts.map(renderRow)}
                </div>
              ))}
              {groups.length === 0 &&
                favoriteOptions.length === 0 &&
                freeOptions.length === 0 &&
                localOptions.length === 0 && (
                  <div
                    style={{
                      padding: '14px 10px',
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                    }}
                  >
                    No models match
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
