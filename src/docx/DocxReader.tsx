import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { type Theme, type ThemePreference } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  isEditableKeyboardTarget,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  stepPageZoom,
} from '../readerConfig'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { useDocumentShell } from '../ui/useDocumentShell'
import { SearchPanel } from '../ui/SearchPanel'
import { ThemePicker } from '../ui/ThemePicker'
import { CommandPalette } from '../ui/CommandPalette'
import { createAskTopbarAction, createSearchTopbarAction } from '../ui/topbarActions'
import { actionsPaletteGroup, libraryPaletteGroup, themePaletteGroup } from '../ui/paletteGroups'
import { applyFindHighlights, type FindHighlights } from '../markdown/findHighlights'
import DocAssistant from '../DocAssistant'
import type { LibraryDoc } from '../library'

// Word's default bullet-list style renders its marker with font-family:
// Symbol and a content string starting with U+F0B7 — a legacy Windows-only
// font's private-use codepoint for a round bullet. Off Windows that font
// doesn't exist, so the marker shows as tofu. Scoped to content declarations
// followed (before the rule's closing brace) by font-family: Symbol, so
// numbered-list counters and anything else are untouched.
const SYMBOL_BULLET_CONTENT_PATTERN = /content:\s*"[^"]*"(?=[^}]*font-family:\s*Symbol)/g

function fixSymbolFontBullets(container: HTMLElement) {
  for (const style of container.querySelectorAll('style')) {
    const text = style.textContent
    if (text && SYMBOL_BULLET_CONTENT_PATTERN.test(text)) {
      style.textContent = text.replace(SYMBOL_BULLET_CONTENT_PATTERN, 'content: "•"')
    }
  }
}

type DocxReaderProps = {
  fileName: string
  docKey: string
  docxData: ArrayBuffer
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

export default function DocxReader({
  fileName,
  docKey,
  docxData,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: DocxReaderProps) {
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const findMarksRef = useRef<HTMLElement[]>([])

  const [pageZoom, setPageZoom] = useState(1)
  const [loadError, setLoadError] = useState('')
  const [ready, setReady] = useState(false)
  const [plainText, setPlainText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [findCount, setFindCount] = useState(0)
  const [findIndex, setFindIndex] = useState(0)
  const [assistantPrefill, setAssistantPrefill] = useState<{
    text: string
    tick: number
    autoSend?: boolean
  } | null>(null)

  const { panels, closeAllPanels, openPanel, searchOpen, assistantOpen } = useDocumentShell()

  const trimmedSearchQuery = searchQuery.trim()

  // Render the document once into the content host.
  useEffect(() => {
    const container = contentRef.current
    if (!container) {
      return
    }

    let cancelled = false
    setReady(false)
    setLoadError('')
    container.replaceChildren()

    const load = async () => {
      try {
        await renderAsync(docxData, container, undefined, { inWrapper: true })
        // Fix bullets unconditionally, even if this effect run is stale
        // (React StrictMode double-invokes it in dev): renderAsync can't be
        // cancelled, so a stale run's DOM mutations can still land after a
        // fresh one's — this keeps the container correct either way.
        fixSymbolFontBullets(container)
        if (cancelled) {
          return
        }
        setPlainText(container.innerText)
        setReady(true)
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not render this document.',
          )
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [docxData])

  useEffect(() => {
    closeAllPanels()
    setSearchQuery('')
  }, [docKey, closeAllPanels])

  // Persistent find: highlight every match while the panel has a query.
  useEffect(() => {
    if (!searchOpen || !trimmedSearchQuery || !ready) {
      findMarksRef.current = []
      setFindCount(0)
      setFindIndex(0)
      return
    }

    const scope = contentRef.current
    if (!scope) {
      return
    }

    let controller: FindHighlights | null = null
    const timer = window.setTimeout(() => {
      controller = applyFindHighlights(scope, trimmedSearchQuery)
      findMarksRef.current = controller.marks
      setFindCount(controller.marks.length)
      setFindIndex(0)
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller?.clear()
      findMarksRef.current = []
    }
  }, [searchOpen, trimmedSearchQuery, ready])

  // Track the current match: accent it and bring it into view.
  useEffect(() => {
    const marks = findMarksRef.current
    if (marks.length === 0) {
      return
    }

    marks.forEach((mark, index) => {
      mark.classList.toggle('find-current', index === findIndex)
    })
    marks[findIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [findIndex, findCount])

  const stepFind = useCallback((direction: 1 | -1) => {
    setFindIndex((current) => {
      const count = findMarksRef.current.length
      if (count === 0) {
        return 0
      }
      return (current + direction + count) % count
    })
  }, [])

  // The find marks double as the results list — no separate section index
  // exists for a docx, so "search" here just means "find in this document".
  const searchResults = useMemo(
    () =>
      findMarksRef.current.map((mark, index) => ({
        id: `match-${index}`,
        text:
          mark
            .closest('p, li, h1, h2, h3, h4, h5, h6, td, th')
            ?.textContent?.trim()
            .slice(0, 160) ??
          mark.textContent ??
          '',
      })),
    [findCount],
  )

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const changePageZoom = useCallback((value: number) => {
    setPageZoom(clampPageZoom(value))
  }, [])

  const stepZoom = useCallback((direction: 'in' | 'out') => {
    setPageZoom((current) => stepPageZoom(current, direction))
  }, [])

  const askQuery = useCallback(
    (text: string) => {
      setAssistantPrefill({ text, tick: Date.now(), autoSend: true })
      openPanel('assistant')
    },
    [openPanel],
  )

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }
    return attachDocumentZoomWheel(root, (direction) => stepZoom(direction))
  }, [stepZoom])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (applyZoomKeyboardShortcut(event, stepZoom)) {
        return
      }
      if (event.key === '/' && !isEditableKeyboardTarget(event.target)) {
        event.preventDefault()
        openPanel('search')
        focusSearchInput()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusSearchInput, openPanel, stepZoom])

  const pageZoomPercent = Math.round(pageZoom * 100)

  const topbarActions: TopbarAction[] = [
    createSearchTopbarAction(searchOpen || Boolean(trimmedSearchQuery), () => {
      panels.toggle('search')
      if (!searchOpen) {
        focusSearchInput()
      }
    }),
    createAskTopbarAction(assistantOpen, () => panels.toggle('assistant')),
  ]

  const settingsContent = (
    <>
      <div className="settings-group">
        <div className="settings-label-row">
          <p className="settings-label">Scale</p>
          <span className="scale-value" aria-live="polite">
            {pageZoomPercent}%
          </span>
        </div>
        <div className="scale-control">
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom out"
            onClick={() => stepZoom('out')}
            disabled={pageZoom <= PAGE_ZOOM_MIN}
          >
            −
          </button>
          <input
            type="range"
            className="scale-slider"
            min={PAGE_ZOOM_MIN * 100}
            max={PAGE_ZOOM_MAX * 100}
            step={1}
            value={pageZoomPercent}
            aria-label="Page scale"
            onChange={(event) => changePageZoom(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom in"
            onClick={() => stepZoom('in')}
            disabled={pageZoom >= PAGE_ZOOM_MAX}
          >
            +
          </button>
        </div>
      </div>

      <ThemePicker preference={themePreference} onSelect={onSelectTheme} />
    </>
  )

  const paletteGroups = [
    actionsPaletteGroup([
      {
        id: 'search',
        title: 'Search document',
        keywords: 'find text',
        action: () => {
          openPanel('search')
          focusSearchInput()
        },
      },
      {
        id: 'ask',
        title: 'Ask about this document',
        keywords: 'ai assistant chat',
        action: () => panels.toggle('assistant'),
      },
      {
        id: 'library',
        title: 'Back to library',
        keywords: 'home close',
        action: onHome,
      },
    ]),
    libraryPaletteGroup(onOpenLibrary, fileName),
    themePaletteGroup(themePreference, onSelectTheme),
  ]

  return (
    <div className="reader-root" ref={readerRootRef} data-theme={theme}>
      <CommandPalette groups={paletteGroups} onAskQuery={askQuery} />

      <DocAssistant
        open={assistantOpen}
        onClose={() => panels.close('assistant')}
        markdown={plainText}
        fileName={fileName}
        sections={[]}
        onNavigateToSection={() => {}}
        prefill={assistantPrefill}
      />

      <SearchPanel
        open={searchOpen}
        onClose={() => panels.close('search')}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        inputRef={searchInputRef}
        placeholder="Search this document"
        resultNoun="match"
        results={searchResults}
        find={{ count: findCount, index: findIndex, onStep: stepFind }}
        onSelect={(item) => {
          const index = searchResults.findIndex((result) => result.id === item.id)
          if (index >= 0) {
            setFindIndex(index)
          }
        }}
      />

      <div className="reader-canvas reader-canvas-docx" data-theme={theme}>
        <div className="doc-stage">
          <div className="doc-col">
            {loadError ? (
              <article className="docx-message">
                <h1>Unable to load document</h1>
                <p>{loadError}</p>
              </article>
            ) : null}
            {!loadError && !ready ? (
              <p className="docx-loading">Loading {fileName}…</p>
            ) : null}
            <div
              className="docx-page-host"
              style={{ '--docx-zoom': pageZoom } as CSSProperties}
              ref={contentRef}
              hidden={Boolean(loadError)}
            />
          </div>
        </div>
      </div>

      <ReaderTopbar fileName={fileName} onHome={onHome} actions={topbarActions} settings={settingsContent} />
    </div>
  )
}
