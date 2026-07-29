import type { ReactNode } from 'react'
import type { DocumentFormat } from '../documents/types'
import { ImageFormatIcon } from './icons'

type DocumentFormatPreviewProps = {
  format: DocumentFormat
  title: string
  /** Real captured thumbnail (data URL); replaces the stylized preview. */
  thumbnail?: string | null
  /** Overlay (e.g. a resume badge) anchored to the sheet, not the caption below it. */
  badge?: ReactNode
}

function MarkdownPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-page">
      <span className="doc-card-page-title">{title}</span>
      <span className="doc-card-page-rule" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line short" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line short" />
    </div>
  )
}

function PdfPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-format-sheet doc-card-format-sheet-pdf">
      <span className="doc-card-format-sheet-title">{title}</span>
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block" />
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block short" />
    </div>
  )
}

function CsvPreviewBody() {
  return (
    <div className="doc-card-format-grid" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className="doc-card-format-grid-cell" />
      ))}
    </div>
  )
}

function DocxPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-format-sheet doc-card-format-sheet-docx">
      <span className="doc-card-format-sheet-title">{title}</span>
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block" />
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block short" />
    </div>
  )
}

function PptxPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-format-sheet doc-card-format-sheet-pptx">
      <span className="doc-card-format-sheet-title">{title}</span>
      <span className="doc-card-format-slide" aria-hidden="true" />
      <span className="doc-card-format-sheet-block" />
      <span className="doc-card-format-sheet-block short" />
    </div>
  )
}

function ImagePreviewBody() {
  return (
    <div className="doc-card-format-frame" aria-hidden="true">
      <ImageFormatIcon size={34} strokeWidth={1.5} />
    </div>
  )
}

function CodePreviewBody() {
  return (
    <div className="doc-card-format-code" aria-hidden="true">
      <span className="doc-card-format-code-line indent" />
      <span className="doc-card-format-code-line" />
      <span className="doc-card-format-code-line short" />
      <span className="doc-card-format-code-line indent" />
      <span className="doc-card-format-code-line medium" />
    </div>
  )
}

export function DocumentFormatPreview({
  format,
  title,
  thumbnail,
  badge,
}: DocumentFormatPreviewProps) {
  if (thumbnail) {
    return (
      <div className={`doc-card-preview doc-card-preview-${format}`}>
        <img className="doc-card-thumb" src={thumbnail} alt="" aria-hidden="true" />
        {badge}
      </div>
    )
  }

  return (
    <div className={`doc-card-preview doc-card-preview-${format}`}>
      {format === 'markdown' ? <MarkdownPreviewBody title={title} /> : null}
      {format === 'pdf' ? <PdfPreviewBody title={title} /> : null}
      {format === 'csv' ? <CsvPreviewBody /> : null}
      {format === 'excel' ? <CsvPreviewBody /> : null}
      {format === 'docx' ? <DocxPreviewBody title={title} /> : null}
      {format === 'pptx' ? <PptxPreviewBody title={title} /> : null}
      {format === 'image' ? <ImagePreviewBody /> : null}
      {format === 'code' ? <CodePreviewBody /> : null}
      {badge}
    </div>
  )
}
