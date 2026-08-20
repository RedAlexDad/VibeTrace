import { useEffect, useRef, useState } from 'react'

/**
 * Renders a fenced ```mermaid block as a real diagram with a toggle to
 * switch between the rendered diagram (default) and its source code.
 */
export default function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'diagram' | 'code'>('diagram')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        if (cancelled) return
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        const { svg } = await mermaid.render(id, code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [code])

  const toggle = (
    <div
      style={{
        display: 'flex',
        gap: 4,
        justifyContent: 'flex-end',
        paddingBottom: 4,
      }}
    >
      {(
        [
          ['diagram', 'Diagram'],
          ['code', 'Code'],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          style={{
            border: 'none',
            background: mode === m ? 'var(--color-bg-soft)' : 'transparent',
            color:
              mode === m ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: mode === m ? 600 : 400,
            fontSize: 10,
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (error) {
    return (
      <div style={{ margin: '6px 0' }}>
        {toggle}
        <pre
          style={{
            background: 'var(--color-error-soft)',
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            color: 'var(--color-error-text)',
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          Mermaid error: {error}
        </pre>
      </div>
    )
  }

  return (
    <div style={{ margin: '6px 0' }}>
      {toggle}
      {mode === 'diagram' ? (
        <div
          ref={containerRef}
          style={{
            padding: 8,
            background: 'var(--color-bg-white)',
            borderRadius: 4,
            overflowX: 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}
        />
      ) : (
        <pre
          style={{
            background: 'var(--color-bg-soft)',
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            color: 'var(--color-text-secondary)',
            fontFamily: 'IBM Plex Mono, monospace',
            maxWidth: '100%',
            margin: 0,
          }}
        >
          {code}
        </pre>
      )}
    </div>
  )
}
