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
}

const initialState: UiState = {
  subtaskPanelVisible: false,
  subtaskFlowLayoutMode: 'timeline',
  wsCollapsed: false,
  sessionsCollapsed: false,
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
  },
})

export const {
  setSubtaskPanelVisible,
  setSubtaskFlowLayoutMode,
  setWsCollapsed,
  setSessionsCollapsed,
} = uiSlice.actions

export default uiSlice.reducer
