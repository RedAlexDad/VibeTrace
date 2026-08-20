import { memo } from 'react'
import { Tooltip } from 'react-tooltip'
import ActionFlowContextMenu from '@/widgets/action-flow/ui/ActionFlowContextMenu'
import { useActionFlowD3 } from './useActionFlowD3'
import {
  BLOCK_H,
  BOTTOM_PAD,
  MAX_VISIBLE_ROWS,
  MIN_SVG_CONTENT_HEIGHT,
  ROW_H,
  TOP_PAD,
} from './layout/constants'
import type { Props } from './layout/types'

export type { FlowEndSummary } from './layout/types'

export default memo(function ActionFlowVisualization(props: Props) {
  const {
    onSelectAction,
    onForkFromAction,
    onAnalyzeFromAction,
    mockBranchForkActionIndex,
    embedded,
    viewportMaxHeight,
    hideScrollbar,
  } = props
  const {
    svgRef,
    scrollRef,
    contextMenu,
    setContextMenu,
    tooltipMounted,
    tooltipId,
    layoutEstimate,
  } = useActionFlowD3(props)

  const mockOffset = mockBranchForkActionIndex !== undefined ? ROW_H : 0
  const contentHeight = layoutEstimate.totalH + mockOffset
  /** Scroll port enforces a two-lane minimum height; cap with `viewportMaxHeight` for inner scrolling */
  const minContentHeight = MIN_SVG_CONTENT_HEIGHT
  const maxVisibleHeight = Math.max(
    TOP_PAD + MAX_VISIBLE_ROWS * ROW_H + BLOCK_H + BOTTOM_PAD,
    minContentHeight,
  )
  const normalViewportHeight = Math.min(Math.max(contentHeight, minContentHeight), maxVisibleHeight)
  let viewportHeight = normalViewportHeight
  if (
    typeof viewportMaxHeight === 'number' &&
    Number.isFinite(viewportMaxHeight) &&
    viewportMaxHeight > 0
  ) {
    viewportHeight = Math.min(viewportHeight, viewportMaxHeight)
  }
  /** `maxHeight` caps overflow only — short content keeps intrinsic height (no phantom scrollbars) */
  const scrollAreaMaxHeight = viewportHeight

  /** Avoid inner borders — `box-sizing` would shrink scrollable area vs SVG by 2 px and falsely show scrollbars */
  const scrollInner = (
    <div
      className={hideScrollbar ? 'action-flow-scroll--hide-scrollbar' : undefined}
      onClick={() => onSelectAction?.(null)}
      style={{
        boxSizing: 'border-box',
        overflowX: 'auto',
        overflowY: 'auto',
        width: '100%',
        flexShrink: 0,
        height: 'auto',
        maxHeight: scrollAreaMaxHeight,
        minHeight: 0,
      }}
      ref={scrollRef}
    >
      <svg
        ref={svgRef}
        data-action-flow-root="1"
        style={{
          display: 'block',
          verticalAlign: 'top',
        }}
      />
    </div>
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flexShrink: 0,
          alignSelf: 'flex-start',
          width: '100%',
        }}
      >
        {embedded ? (
          scrollInner
        ) : (
          <div
            style={{
              boxSizing: 'border-box',
              border: '1px solid var(--color-border-light)',
              borderRadius: 8,
              background: 'var(--color-bg-elevated)',
              overflow: 'hidden',
              width: '100%',
            }}
          >
            {scrollInner}
          </div>
        )}
        {tooltipMounted && (
          <Tooltip
            id={tooltipId}
            anchorSelect={`[data-tooltip-id="${tooltipId}"]`}
            className="action-flow-react-tooltip"
            variant="light"
            positionStrategy="fixed"
            delayShow={150}
            delayHide={220}
            opacity={1}
            clickable
            /** Inner `overflow:auto` can bubble `scroll` globally and dismiss tooltips prematurely */
            globalCloseEvents={{ scroll: false, resize: true, escape: true }}
            arrowColor="var(--color-bg-elevated)"
          />
        )}
      </div>
      <ActionFlowContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onFork={onForkFromAction}
        onAnalysis={onAnalyzeFromAction}
      />
    </>
  )
})
