import type { CSSProperties } from 'react'
import { INK_COLOR_OPTIONS } from './inkConfig'
import { CloseIcon, LaserIcon, PenIcon } from './icons'

type LaserToolbarProps = {
  color: string
  onColorChange: (color: string) => void
  onSwitchToDraw?: () => void
  onExit?: () => void
}

/**
 * The presentation cluster while the laser pointer is live. Mirrors
 * DrawToolbar so switching tools never moves the controls under the pointer.
 */
export function LaserToolbar({
  color,
  onColorChange,
  onSwitchToDraw,
  onExit,
}: LaserToolbarProps) {
  return (
    <div
      className="present-toolbar-shell laser-toolbar-shell"
      role="toolbar"
      aria-label="Presentation tools"
    >
      <div className="present-toolbar app-topbar">
        <div className="present-toolbar-tools" role="group" aria-label="Tool">
          <button
            type="button"
            className="icon-button active present-tool-button"
            aria-label="Laser pointer"
            aria-pressed={true}
            title="Laser pointer (L)"
          >
            <LaserIcon />
          </button>
          {onSwitchToDraw ? (
            <button
              type="button"
              className="icon-button present-tool-button"
              aria-label="Pen"
              aria-pressed={false}
              title="Pen (D)"
              onClick={onSwitchToDraw}
            >
              <PenIcon />
            </button>
          ) : null}
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="present-toolbar-colors" role="group" aria-label="Laser colors">
          {INK_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                color === option.value ? 'draw-color-swatch active' : 'draw-color-swatch'
              }
              aria-label={option.label}
              aria-pressed={color === option.value}
              style={{ '--swatch-color': option.value } as CSSProperties}
              onClick={() => onColorChange(option.value)}
            />
          ))}
        </div>

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
