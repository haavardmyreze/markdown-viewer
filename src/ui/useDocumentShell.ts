import { usePanels } from './usePanels'
import { useReaderDrawMode } from './useReaderInk'

/**
 * The shared shell state for every format reader: which panel is open and
 * whether presentation mode (laser/draw) is live. Composing them here keeps
 * the invariant in one place — entering a presentation tool closes the
 * panels, so the two systems never compete for the reading surface.
 */
export function useDocumentShell() {
  const panels = usePanels()
  const present = useReaderDrawMode(panels.closeAll)

  return {
    panels,
    closeAllPanels: panels.closeAll,
    openPanel: panels.open,
    closePanel: panels.close,
    searchOpen: panels.isOpen('search'),
    commentsOpen: panels.isOpen('comments'),
    assistantOpen: panels.isOpen('assistant'),
    present,
  }
}
