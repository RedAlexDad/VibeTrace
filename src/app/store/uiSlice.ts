import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface UiState {
  /** VibeTrace side panel visibility */
  subtaskPanelVisible: boolean
  /** Column layout: timeline vs summary */
  subtaskFlowLayoutMode: 'timeline' | 'summary'
  /** Workspaces panel collapsed */
  wsCollapsed: boolean
  /** Sessions panel collapsed */
  sessionsCollapsed: boolean
  /** Parent folders collapsed in the workspace list */
  collapsedGroups: string[]
}

const initialState: UiState = {
  subtaskPanelVisible: false,
  subtaskFlowLayoutMode: 'timeline',
  wsCollapsed: false,
  sessionsCollapsed: false,
  collapsedGroups: [],
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSubtaskPanelVisible(state, action: PayloadAction<boolean>) {
      state.subtaskPanelVisible = action.payload
    },
    setSubtaskFlowLayoutMode(state, action: PayloadAction<'timeline' | 'summary'>) {
      state.subtaskFlowLayoutMode = action.payload
    },
    setWsCollapsed(state, action: PayloadAction<boolean>) {
      state.wsCollapsed = action.payload
    },
    setSessionsCollapsed(state, action: PayloadAction<boolean>) {
      state.sessionsCollapsed = action.payload
    },
    toggleGroupCollapsed(state, action: PayloadAction<string>) {
      const key = action.payload
      const i = state.collapsedGroups.indexOf(key)
      if (i >= 0) {
        state.collapsedGroups.splice(i, 1)
      } else {
        state.collapsedGroups.push(key)
      }
    },
  },
})

export const {
  setSubtaskPanelVisible,
  setSubtaskFlowLayoutMode,
  setWsCollapsed,
  setSessionsCollapsed,
  toggleGroupCollapsed,
} = uiSlice.actions

export default uiSlice.reducer
