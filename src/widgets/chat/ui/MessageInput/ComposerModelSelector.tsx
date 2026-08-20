import { useMemo } from 'react'
import { SHOW_COMPOSER_MODEL_UI } from '@/shared/config/featureFlags'
import { COMPOSER_MODEL_DOM_ID } from '@/shared/config/storageKeys'
import type { MessageInputProps } from './types'

export default function ComposerModelSelector({
  composerModelRef = '',
  onComposerModelRefChange,
  composerModelOptions = [],
  composerModelsLoading = false,
  composerModelsError = null,
  envBootstrapModel = null,
  disabled,
}: Pick<
  MessageInputProps,
  | 'composerModelRef'
  | 'onComposerModelRefChange'
  | 'composerModelOptions'
  | 'composerModelsLoading'
  | 'composerModelsError'
  | 'envBootstrapModel'
  | 'disabled'
>) {
  const nextSendModelHint = useMemo(() => {
    if (!SHOW_COMPOSER_MODEL_UI) return ''
    const picked = composerModelRef.trim()
    if (picked) return picked
    const env = (envBootstrapModel && envBootstrapModel.trim()) || ''
    if (env) return `${env}（VITE_OPENCODE_DEFAULT_MODEL）`
    return 'OpenCode 服务端默认'
  }, [composerModelRef, envBootstrapModel])

  return (
    <div
      style={{
        marginBottom: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label
          htmlFor={COMPOSER_MODEL_DOM_ID}
          style={{ fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}
        >
          模型
        </label>
        <select
          id={COMPOSER_MODEL_DOM_ID}
          value={composerModelRef.trim() ? composerModelRef.trim() : ''}
          onChange={(e) => onComposerModelRefChange?.(e.target.value)}
          disabled={disabled || !onComposerModelRefChange || composerModelsLoading}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--color-border-light)',
            background: 'var(--color-bg-white)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="">默认（不在请求里指定 model）</option>
          {composerModelOptions.map((o) => (
            <option key={o.ref} value={o.ref}>
              {o.label}
            </option>
          ))}
        </select>
        {composerModelsLoading && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            加载中…
          </span>
        )}
      </div>
      {composerModelsError && (
        <div style={{ fontSize: 10, color: 'var(--color-error-text)', lineHeight: 1.4 }}>
          无法拉取模型列表（需要 OpenCode 暴露 GET /config/providers）：{composerModelsError}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
        下一条消息将使用：
        <span style={{ color: 'var(--color-text-secondary)' }}>{nextSendModelHint}</span>
      </div>
    </div>
  )
}
