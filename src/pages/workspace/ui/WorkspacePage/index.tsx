import Sidebar from '@/widgets/sidebar/ui/Sidebar'
import MessagePanel from '@/widgets/chat/ui/MessagePanel'
import SubtaskDebugPanel from '@/widgets/vibetrace-panel/ui/SubtaskDebugPanel'
import FullscreenSubtaskPanel from '@/widgets/vibetrace-panel/ui/FullscreenSubtaskPanel'
import ActionAnalysisModal from '@/features/action-analysis/ui/ActionAnalysisModal'
import ForkSessionModal from '@/features/fork-session/ui/ForkSessionModal'
import SubtaskMessageConnector from '@/features/subtask-linking/ui/SubtaskMessageConnector'
import SubtaskPanelHeader from './SubtaskPanelHeader'
import { useWorkspacePage } from './useWorkspacePage'

function WorkspacePage() {
  const {
    sessionsInFolder,
    directories,
    recencyMap,
    selectedDirectory,
    handleSelectDirectory,
    selectedSessionId,
    setSelectedSessionId,
    handleCreateSession,
    creatingSession,
    handleArchiveSession,
    archivingSessionId,
    apiConnected,
    handleAddDirectory,
    handleCloseDirectory,
    linkAreaRef,
    messages,
    sessionTodoModel,
    archivedForPanel,
    latestTodowriteBatchProgress,
    loading,
    waitingForAssistantReply,
    selectedSession,
    loadSessionData,
    activeSessionDirectory,
    handleSendMessage,
    handleAbortMessage,
    aborting,
    messageScrollRef,
    todoPanelScrollRef,
    linkedTodoIds,
    todoPanelRevealGeneration,
    handleTodoClick,
    handleSessionTitleCommit,
    pendingQuestions,
    handleQuestionReply,
    handleQuestionReject,
    questionSubmitting,
    handleQuestionAnswered,
    composerModelRef,
    handleComposerModelRefChange,
    composerModelOptionsForUi,
    composerModelsLoading,
    composerModelsError,
    envBootstrapModel,
    subtaskPanelVisible,
    subtaskFlowLayoutMode,
    setFlowLayoutMode,
    hideSubtaskPanel,
    showSubtaskPanel,
    compactionControlHint,
    visibleSubtasks,
    linkedSubtaskIndex,
    toggleSubtaskLink,
    subtaskScrollRef,
    forkPanelSnapshotBundle,
    selection,
    handleSelectAction,
    subtaskFullscreenOpen,
    openFullscreen,
    closeFullscreen,
    handleForkFromAction,
    handleAnalyzeFromAction,
    pendingFork,
    forkBusy,
    closeForkModal,
    handleConfirmForkWithPrompt,
    linkedMessageToAction,
    noTodoAnchor,
    analysisAction,
    closeAnalysisModal,
  } = useWorkspacePage()

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--color-bg-base)',
        position: 'relative',
      }}
    >
      {/* Sidebar: workspaces + sessions */}
      <Sidebar
        sessionsInFolder={sessionsInFolder}
        directories={directories}
        recencyMap={recencyMap}
        selectedDirectory={selectedDirectory}
        onSelectDirectory={handleSelectDirectory}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        onCreateSession={handleCreateSession}
        creatingSession={creatingSession}
        onArchiveSession={handleArchiveSession}
        archivingSessionId={archivingSessionId}
        apiConnected={apiConnected}
        onAddDirectory={handleAddDirectory}
        onCloseDirectory={handleCloseDirectory}
      />

      {/* Center + right columns share one positioned parent for connector lines */}
      <div
        ref={linkAreaRef}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          position: 'relative',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              width: '100%',
              minHeight: 0,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <MessagePanel
              messages={messages}
              latestTodos={sessionTodoModel.latestActive}
              archivedTodos={archivedForPanel}
              latestTodowriteBatchProgress={latestTodowriteBatchProgress}
              loading={loading}
              waitingForAssistantReply={waitingForAssistantReply}
              sessionId={selectedSessionId}
              sessionTitle={selectedSession?.title}
              onRefresh={() => loadSessionData(selectedSessionId, activeSessionDirectory)}
              onSendMessage={handleSendMessage}
              onAbortMessage={handleAbortMessage}
              aborting={aborting}
              messageListScrollRef={messageScrollRef}
              todoPanelScrollRef={todoPanelScrollRef}
              highlightMessageIndices={null}
              highlightTodoIds={linkedTodoIds}
              todoPanelRevealGeneration={todoPanelRevealGeneration}
              onTodoClick={handleTodoClick}
              onSessionTitleCommit={handleSessionTitleCommit}
              pendingQuestion={
                selectedSessionId ? (pendingQuestions[selectedSessionId] ?? null) : null
              }
              onQuestionReply={handleQuestionReply}
              onQuestionReject={handleQuestionReject}
              questionSubmitting={questionSubmitting}
              sessionDirectory={activeSessionDirectory}
              onQuestionAnswered={handleQuestionAnswered}
              composerModelRef={composerModelRef}
              onComposerModelRefChange={handleComposerModelRefChange}
              composerModelOptions={composerModelOptionsForUi}
              composerModelsLoading={composerModelsLoading}
              composerModelsError={composerModelsError}
              envBootstrapModel={envBootstrapModel}
            />
          </div>
        </div>

        {subtaskPanelVisible ? (
          <div
            style={{
              width: 630,
              flexShrink: 0,
              background: 'var(--color-bg-white)',
              borderLeft: '1px solid var(--color-border-light)',
              display: 'flex',
              flexDirection: 'column',
              transition: 'width 0.25s ease',
            }}
          >
            <SubtaskPanelHeader
              compactionControlHint={compactionControlHint}
              composerModelRef={composerModelRef}
              envBootstrapModel={envBootstrapModel}
              subtaskFlowLayoutMode={subtaskFlowLayoutMode}
              subtasksCount={visibleSubtasks.length}
              onSetFlowLayoutMode={setFlowLayoutMode}
              onHidePanel={hideSubtaskPanel}
              onOpenFullscreen={openFullscreen}
            />
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                padding: '12px 14px',
                gap: 12,
              }}
            >
              <SubtaskDebugPanel
                messages={messages}
                visibleSubtasks={visibleSubtasks}
                linkedSubtaskIndex={linkedSubtaskIndex}
                onSelectSubtask={toggleSubtaskLink}
                onForkFromAction={handleForkFromAction}
                onAnalyzeFromAction={handleAnalyzeFromAction}
                listScrollRef={subtaskScrollRef}
                sessionDirectory={activeSessionDirectory}
                forkPanelSnapshotBundle={forkPanelSnapshotBundle}
                flowLayoutMode={subtaskFlowLayoutMode}
                selection={selection}
                onSelectAction={handleSelectAction}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              width: 36,
              flexShrink: 0,
              background: 'var(--color-bg-white)',
              borderLeft: '1px solid var(--color-border-light)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 10,
            }}
          >
            <button
              type="button"
              onClick={showSubtaskPanel}
              aria-label="Show VibeTrace panel"
              title="Show VibeTrace panel"
              style={{
                width: 30,
                height: 30,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: 'var(--color-text-secondary)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        <ForkSessionModal
          open={pendingFork !== null}
          submitting={forkBusy}
          onClose={closeForkModal}
          onConfirm={handleConfirmForkWithPrompt}
        />

        <SubtaskMessageConnector
          containerRef={linkAreaRef}
          messageScrollRef={messageScrollRef}
          todoPanelScrollRef={todoPanelScrollRef}
          subtaskScrollRef={subtaskScrollRef}
          subtaskIndex={linkedSubtaskIndex}
          linkedTodoIds={linkedTodoIds}
          linkedMessageToAction={linkedMessageToAction}
          noTodoAnchor={noTodoAnchor}
        />
        {analysisAction ? (
          <ActionAnalysisModal action={analysisAction} onClose={closeAnalysisModal} />
        ) : null}

        <FullscreenSubtaskPanel
          open={subtaskFullscreenOpen}
          onClose={closeFullscreen}
          messages={messages}
          visibleSubtasks={visibleSubtasks}
          linkedSubtaskIndex={linkedSubtaskIndex}
          onSelectSubtask={toggleSubtaskLink}
          onForkFromAction={handleForkFromAction}
          onAnalyzeFromAction={handleAnalyzeFromAction}
          sessionDirectory={activeSessionDirectory}
          forkPanelSnapshotBundle={forkPanelSnapshotBundle}
          flowLayoutMode={subtaskFlowLayoutMode}
          selection={selection}
          onSelectAction={handleSelectAction}
        />
      </div>
    </div>
  )
}

export default WorkspacePage
