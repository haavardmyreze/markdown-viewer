import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { parsePptx, type PptxSlide } from './parsePptx'

type PptxReaderProps = {
  fileName: string
  docKey: string
  pptxData: ArrayBuffer
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

function slidesToPlainText(slides: PptxSlide[]): string {
  return slides
    .map((slide) => `## Slide ${slide.index + 1}\n\n${slide.paragraphs.join('\n')}`)
    .join('\n\n')
}

export default function PptxReader({
  fileName,
  docKey,
  pptxData,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: PptxReaderProps) {
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const slidesHostRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const findMarksRef = useRef<HTMLElement[]>([])

  const [pageZoom, setPageZoom] = useState(1)
  const [loadError, setLoadError] = useState('')
  const [slides, setSlides] = useState<PptxSlide[] | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setSlides(null)
    setLoadError('')

    const load = async () => {
      try {
        const parsed = await parsePptx(pptxData)
        if (!cancelled) {
          setSlides(parsed)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not read this presentation.',
          )
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [pptxData])

  useEffect(() => {
    closeAllPanels()
    setSearchQuery('')
  }, [docKey, closeAllPanels])

  const plainText = useMemo(() => (slides ? slidesToPlainText(slides) : ''), [slides])

  // Persistent find: highlight every match while the panel has a query.
  useEffect(() => {
    if (!searchOpen || !trimmedSearchQuery || !slides) {
      findMarksRef.current = []
      setFindCount(0)
      setFindIndex(0)
      return
    }

    const scope = slidesHostRef.current
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
  }, [searchOpen, trimmedSearchQuery, slides])

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

  const searchResults = useMemo(
    () =>
      findMarksRef.current.map((mark, index) => ({
        id: `match-${index}`,
        text:
          mark.closest('.pptx-slide')?.querySelector('.pptx-slide-number')?.textContent ??
          mark.textContent ??
          '',
        snippet: mark.closest('p')?.textContent?.trim().slice(0, 160),
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
        title: 'Search slides',
        keywords: 'find text',
        action: () => {
          openPanel('search')
          focusSearchInput()
        },
      },
      {
        id: 'ask',
        title: 'Ask about this presentation',
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
        placeholder="Search this presentation"
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

      <div className="reader-canvas reader-canvas-pptx" data-theme={theme}>
        <div className="doc-stage">
          <div className="doc-col">
            {loadError ? (
              <article className="docx-message">
                <h1>Unable to load presentation</h1>
                <p>{loadError}</p>
              </article>
            ) : null}
            {!loadError && !slides ? (
              <p className="docx-loading">Loading {fileName}…</p>
            ) : null}
            {!loadError && slides ? (
              <div
                className="pptx-slide-host"
                style={{ '--docx-zoom': pageZoom } as CSSProperties}
                ref={slidesHostRef}
              >
                {slides.length === 0 ? (
                  <article className="docx-message">
                    <h1>No slides found</h1>
                    <p>This presentation has no readable slide content.</p>
                  </article>
                ) : (
                  slides.map((slide) => (
                    <article className="pptx-slide" key={slide.index}>
                      <p className="pptx-slide-number">Slide {slide.index + 1}</p>
                      {slide.images.map((src, imageIndex) => (
                        <img key={imageIndex} src={src} alt="" className="pptx-slide-image" />
                      ))}
                      {slide.paragraphs.map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex} className="pptx-slide-text">
                          {paragraph}
                        </p>
                      ))}
                      {slide.paragraphs.length === 0 && slide.images.length === 0 ? (
                        <p className="pptx-slide-empty">No extractable content on this slide.</p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ReaderTopbar fileName={fileName} onHome={onHome} actions={topbarActions} settings={settingsContent} />
    </div>
  )
}
