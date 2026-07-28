import { useEffect, useRef, useState } from 'react'
import { OutputScale, TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { DocumentComment } from '../documentComments'
import {
  applyHighlightsToTextLayer,
  buildHighlightRangesFromTextLayer,
} from './pdfTextHighlights'

type PdfPageProps = {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  searchQuery: string
  comments: DocumentComment[]
  activeCommentId: string
  commentsOpen: boolean
  /** Fires with the page canvas once rasterized (used for thumbnails). */
  onRendered?: (canvas: HTMLCanvasElement) => void
}

export default function PdfPage({
  pdf,
  pageNumber,
  scale,
  searchQuery,
  comments,
  activeCommentId,
  commentsOpen,
  onRendered,
}: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    let cancelled = false
    let textLayer: TextLayer | null = null

    const renderPage = async () => {
      try {
        setError('')
        host.replaceChildren()
        textLayerRef.current = null

        const page = await pdf.getPage(pageNumber)
        if (cancelled) {
          return
        }

        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Canvas is not available')
        }

        // Render at device-pixel resolution and downscale via CSS, or the
        // canvas looks soft on any HiDPI/Retina display.
        const outputScale = new OutputScale()
        canvas.width = Math.floor(viewport.width * outputScale.sx)
        canvas.height = Math.floor(viewport.height * outputScale.sy)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        canvas.className = 'pdf-page-canvas'

        const textLayerHost = document.createElement('div')
        textLayerHost.className = 'pdf-text-layer'
        textLayerRef.current = textLayerHost

        const pageShell = document.createElement('div')
        pageShell.className = 'pdf-page-shell'
        pageShell.style.width = `${viewport.width}px`
        pageShell.style.height = `${viewport.height}px`
        // TextLayer positions every span with CSS round()/calc() expressions
        // that read these custom properties from an ancestor — without them
        // the math resolves against undefined variables and spans land in
        // the wrong place (visible as misaligned selection/search highlights).
        pageShell.style.setProperty('--total-scale-factor', String(viewport.scale))
        pageShell.style.setProperty('--scale-round-x', '1px')
        pageShell.style.setProperty('--scale-round-y', '1px')
        pageShell.append(canvas, textLayerHost)
        host.append(pageShell)

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : undefined,
        }).promise

        if (cancelled) {
          return
        }

        onRendered?.(canvas)

        const textContent = await page.getTextContent()
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerHost,
          viewport,
        })
        await textLayer.render()

        if (!cancelled && textLayerRef.current) {
          const ranges = buildHighlightRangesFromTextLayer(textLayerRef.current, pageNumber, {
            searchQuery,
            comments,
            activeCommentId,
          })
          applyHighlightsToTextLayer(textLayerRef.current, ranges)
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error ? renderError.message : 'Could not render page.',
          )
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      textLayer?.cancel()
      host.replaceChildren()
      textLayerRef.current = null
    }
  }, [activeCommentId, comments, onRendered, pageNumber, pdf, scale, searchQuery])

  useEffect(() => {
    if (!textLayerRef.current) {
      return
    }

    const ranges = buildHighlightRangesFromTextLayer(textLayerRef.current, pageNumber, {
      searchQuery,
      comments,
      activeCommentId,
    })
    applyHighlightsToTextLayer(textLayerRef.current, ranges)
  }, [activeCommentId, comments, commentsOpen, pageNumber, searchQuery])

  return (
    <article
      className="pdf-page"
      id={`pdf-page-${pageNumber}`}
      data-pdf-page={pageNumber}
      ref={hostRef}
    >
      {error ? <p className="pdf-page-error">{error}</p> : null}
    </article>
  )
}
