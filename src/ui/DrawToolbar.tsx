import type { CSSProperties } from 'react'
import { INK_COLOR_OPTIONS } from './inkConfig'
import { CloseIcon, EraserIcon, LaserIcon, MarkerIcon, PenIcon } from './icons'

export type DrawTool = 'pen' | 'marker' | 'eraser'

type DrawToolbarProps = {
  color: string
  tool: DrawTool
  onColorChange: (color: string) => void
  onToolChange: (tool: DrawTool) => void
  onClearAll: () => void
  onSwitchToLaser?: () => void
  onExit?: () => void
}

function isDrawingTool(tool: DrawTool) {
  return tool === 'pen' || tool === 'marker'
}

/**
 * The presentation cluster while drawing. Mirrors LaserToolbar so switching
 * tools never moves the controls under the pointer.
 */
export function DrawToolbar({
  color,
  tool,
  onColorChange,
  onToolChange,
  onClearAll,
  onSwitchToLaser,
  onExit,
}: DrawToolbarProps) {
  return (
    <div className="present-toolbar-shell" role="toolbar" aria-label="Presentation tools">
      <div className="present-toolbar app-topbar">
        <div className="present-toolbar-tools" role="group" aria-label="Tool">
          {onSwitchToLaser ? (
            <button
              type="button"
              className="icon-button present-tool-button"
              aria-label="Laser pointer"
              aria-pressed={false}
              title="Laser pointer (L)"
              onClick={onSwitchToLaser}
            >
              <LaserIcon />
            </button>
          ) : null}
          <button
            type="button"
            className={
              tool === 'pen'
                ? 'icon-button active present-tool-button'
                : 'icon-button present-tool-button'
            }
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            title="Pen (D)"
            onClick={() => onToolChange('pen')}
          >
            <PenIcon />
          </button>
          <button
            type="button"
            className={
              tool === 'marker'
                ? 'icon-button active present-tool-button'
                : 'icon-button present-tool-button'
            }
            aria-label="Marker"
            aria-pressed={tool === 'marker'}
            title="Marker"
            onClick={() => onToolChange('marker')}
          >
            <MarkerIcon />
          </button>
          <button
            type="button"
            className={
              tool === 'eraser'
                ? 'icon-button active present-tool-button'
                : 'icon-button present-tool-button'
            }
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            title="Eraser"
            onClick={() => onToolChange('eraser')}
          >
            <EraserIcon />
          </button>
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="present-toolbar-colors" role="group" aria-label="Ink colors">
          {INK_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                isDrawingTool(tool) && color === option.value
                  ? 'draw-color-swatch active'
                  : 'draw-color-swatch'
              }
              aria-label={option.label}
              aria-pressed={isDrawingTool(tool) && color === option.value}
              style={{ '--swatch-color': option.value } as CSSProperties}
              onClick={() => {
                if (tool === 'eraser') {
                  onToolChange('pen')
                }
                onColorChange(option.value)
              }}
            />
          ))}
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="ghost-button present-clear-button"
          aria-label="Clear all drawings"
          onClick={onClearAll}
        >
          Clear
        </button>

        {onExit ? (
          <>
            <span className="topbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="icon-button present-tool-button"
              aria-label="Exit presentation"
              title="Exit presentation (Esc)"
              onClick={onExit}
            >
              <CloseIcon />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
