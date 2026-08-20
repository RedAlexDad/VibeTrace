import type { OcComposerModelOption } from '@/shared/api/opencodeApi'

export type MessageSendPayload = {
  combinedText: string
  imageParts: Array<{ media_type: string; data: string }>
}

export interface MessageInputProps {
  onSend: (payload: MessageSendPayload) => Promise<void>
  onAbort?: () => Promise<void>
  disabled?: boolean
  isRunning?: boolean
  aborting?: boolean
  sessionId?: string
  agentName?: string | null
  modelName?: string | null
  /** `provider/model`; empty string → omit body.model (then `.env` default inside API layer may still apply). */
  composerModelRef?: string
  onComposerModelRefChange?: (ref: string) => void
  composerModelOptions?: OcComposerModelOption[]
  composerModelsLoading?: boolean
  composerModelsError?: string | null
  /** Shown when composer selection is empty — mirrors `VITE_OPENCODE_DEFAULT_MODEL`. */
  envBootstrapModel?: string | null
}

export const FONT_SIZE = 12
export const LINE_HEIGHT = 1.5
export const LINE_PX = FONT_SIZE * LINE_HEIGHT
export const MIN_ROWS = 2
export const MAX_ROWS = 6
export const MIN_H = MIN_ROWS * LINE_PX
export const MAX_H = MAX_ROWS * LINE_PX
