import type { ActionType } from '@/shared/types/opencode'

/**
 * 每个 agent 进程占两条横轨：
 * - layer 0：kernel（思考、回复、todowrite/Plan、压缩等，不碰外部资源）
 * - layer 1：外部资源（读盘、网络、shell、task 父级 rect、question 等）
 *
 * 不同 session = 不同进程：在垂直方向向下堆叠，用 `processBand` 区分（0=主会话，1=第一个子会话…）。
 * `row = processBand * ROWS_PER_PROCESS + layer`
 */
export const ROWS_PER_PROCESS = 2

function localLayerForActionType(actionType: ActionType): 0 | 1 {
  if (
    actionType === 'UserRequest' ||
    actionType === 'Think' ||
    actionType === 'Response' ||
    actionType === 'Compaction' ||
    actionType === 'Plan'
  ) {
    return 0
  }
  return 1
}

export function actionRowForBand(processBand: number, actionType: ActionType): number {
  return processBand * ROWS_PER_PROCESS + localLayerForActionType(actionType)
}

export type TaskChildDescriptor = {
  callID: string
  childSessionID: string
  /** 所属 assistant 消息 id（与并行判定 message 边界一致） */
  messageId: string
  /** 与父段 `buildMappedActionsFromMessages` 中该 task part 的 sortTime 对齐 */
  anchorSortTime: number
  description?: string
}
