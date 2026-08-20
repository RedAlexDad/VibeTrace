import { useEffect, useState } from 'react'
import {
  getMcpStatus,
  getSkills,
  type McpServerStatus,
  type OcSkill,
} from '@/shared/api/opencodeApi'

const STATUS_COLOR: Record<McpServerStatus['status'], string> = {
  connected: 'var(--color-success)',
  failed: 'var(--color-error)',
}

export default function McpStatusPanel({ directory }: { directory?: string }) {
  const [open, setOpen] = useState(false)
  const [mcp, setMcp] = useState<Record<string, McpServerStatus> | null>(null)
  const [skills, setSkills] = useState<OcSkill[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getMcpStatus(directory).catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        return null
      }),
      getSkills(directory).catch(() => [] as OcSkill[]),
    ]).then(([m, s]) => {
      if (cancelled) return
      setMcp(m)
      setSkills(s)
    })
    return () => {
      cancelled = true
    }
  }, [directory])

  const mcpList = mcp ? Object.entries(mcp) : []
  const connectedCount = mcpList.filter(([, s]) => s.status === 'connected').length
  const failedCount = mcpList.length - connectedCount

  return (
    <div style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="MCP servers and skills"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border-light)',
          background: 'var(--color-bg-white)',
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>MCP</span>
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{connectedCount}</span>
        {failedCount > 0 && (
          <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{failedCount}</span>
        )}
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Skills</span>
        <span style={{ color: 'var(--color-accent-strong)' }}>
          {skills ? skills.length : '…'}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 3000,
            width: 300,
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            padding: '10px 12px',
          }}
        >
          {error && (
            <div style={{ fontSize: 10, color: 'var(--color-error-text)', marginBottom: 8 }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            MCP servers
          </div>
          {mcpList.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
              No MCP servers
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {mcpList.map(([name, s]) => (
                <div
                  key={name}
                  title={s.error}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 0',
                    fontSize: 11,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: STATUS_COLOR[s.status] ?? 'var(--color-text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {name}
                  </span>
                  {s.status === 'failed' && s.error && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--color-error-text)',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            Skills
          </div>
          {!skills || skills.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No skills</div>
          ) : (
            skills.map((s) => (
              <div
                key={s.name}
                title={s.description}
                style={{
                  padding: '3px 0',
                  fontSize: 11,
                  color: 'var(--color-text-primary)',
                }}
              >
                {s.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
