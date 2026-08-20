import type { OcMessage } from '@/shared/types/opencode'
import type { MappedAction } from '@/shared/types/opencode'
import { toolWallClockWindow } from './timing'
import type { TaskChildDescriptor } from './layout'

/** call_id 仅末尾不同 → 去掉最后一段 `_suffix` 作为 stem */
export function callIdStem(callID: string): string {
  const i = callID.lastIndexOf('_')
  return i >= 0 ? callID.slice(0, i) : callID
}

function windowsOverlap(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

export type ParallelCallInfo = { parallelGroupId: string; parallelLaneIndex: number }

/**
 * 同一 assistant 消息内：call_id 同 stem、且 wall-clock 区间重叠 → 判为并行（含多工具并行）。
 * 返回 callID → 组 id + lane（按 start 升序 0..n-1）。
 */
export function detectParallelCallMapping(
  messages: OcMessage[],
  nowMs: number,
): Map<string, ParallelCallInfo> {
  const out = new Map<string, ParallelCallInfo>()
  type ToolMeta = {
    messageId: string
    callID: string
    stem: string
    window: { startMs: number; endMs: number }
    startMs: number
  }
  const tools: ToolMeta[] = []
  for (const message of messages) {
    if (message.info.role !== 'assistant') continue
    const mid = message.info.id
    for (const part of message.parts) {
      if (part.type !== 'tool') continue
      const tw = toolWallClockWindow(part, message, nowMs)
      if (!tw) continue
      tools.push({
        messageId: mid,
        callID: part.callID,
        stem: callIdStem(part.callID),
        window: tw,
        startMs: tw.startMs,
      })
    }
  }
  const byKey = new Map<string, ToolMeta[]>()
  for (const t of tools) {
    const key = `${t.messageId}:::${t.stem}`
    let arr = byKey.get(key)
    if (!arr) {
      arr = []
      byKey.set(key, arr)
    }
    arr.push(t)
  }
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue
    const n = arr.length
    const uf = new Int32Array(n)
    for (let i = 0; i < n; i++) uf[i] = i
    const find = (i: number): number => {
      let x = i
      while (uf[x] !== x) x = uf[x]!
      return x
    }
    const union = (i: number, j: number) => {
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) uf[ri] = rj
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (windowsOverlap(arr[i]!.window, arr[j]!.window)) union(i, j)
      }
    }
    const comps = new Map<number, ToolMeta[]>()
    for (let i = 0; i < n; i++) {
      const r = find(i)
      let list = comps.get(r)
      if (!list) {
        list = []
        comps.set(r, list)
      }
      list.push(arr[i]!)
    }
    for (const list of comps.values()) {
      if (list.length < 2) continue
      const sorted = [...list].sort((a, b) => a.startMs - b.startMs)
      const messageId = sorted[0]!.messageId
      const minCall = [...sorted.map((m) => m.callID)].sort()[0]!
      const parallelGroupId = `pg-${messageId}-${minCall}`
      sorted.forEach((m, lane) => {
        out.set(m.callID, { parallelGroupId, parallelLaneIndex: lane })
      })
    }
  }
  return out
}

/** 将并行组 id / lane 写入 mapped action（子会话动作按 parentTaskCallID 继承） */
export function applyParallelLayoutFromCalls(
  actions: (MappedAction & { row: number })[],
  parallelByCallId: Map<string, ParallelCallInfo>,
): (MappedAction & { row: number })[] {
  return actions.map((a) => {
    const direct = a.callID ? parallelByCallId.get(a.callID) : undefined
    const inherited = a.parentTaskCallID ? parallelByCallId.get(a.parentTaskCallID) : undefined
    const p = direct ?? inherited
    if (!p) return a
    return { ...a, parallelGroupId: p.parallelGroupId, parallelLaneIndex: p.parallelLaneIndex }
  })
}

/**
 * 并行子任务共享同一进程带（垂直 band），仅通过 parallelLaneIndex 在 SVG 内错开；
 * 非并行仍按唯一 childSessionID 递增 band。
 */
export function buildChildSessionBandMap(
  descriptors: TaskChildDescriptor[],
  parallelByCallId: Map<string, ParallelCallInfo>,
): Map<string, number> {
  const m = new Map<string, number>()
  const groupBand = new Map<string, number>()
  let nextBand = 1
  for (const d of descriptors) {
    const para = parallelByCallId.get(d.callID)
    if (para) {
      const gid = para.parallelGroupId
      if (!groupBand.has(gid)) {
        groupBand.set(gid, nextBand++)
      }
      m.set(d.childSessionID, groupBand.get(gid)!)
    } else {
      if (!m.has(d.childSessionID)) {
        m.set(d.childSessionID, nextBand++)
      }
    }
  }
  return m
}