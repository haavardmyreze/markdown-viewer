export type DocumentFormat =
  | 'markdown'
  | 'pdf'
  | 'csv'
  | 'image'
  | 'code'
  | 'excel'
  | 'docx'
  | 'pptx'

export type DocumentSource =
  | { format: 'markdown'; content: string }
  | { format: 'pdf'; data: ArrayBuffer }
  | { format: 'csv'; content: string }
  | { format: 'image'; data: ArrayBuffer; fileName: string }
  | { format: 'code'; content: string; language?: string }
  /** Converted to CSV at load time; reuses the CSV reader as-is. */
  | { format: 'excel'; content: string }
  | { format: 'docx'; data: ArrayBuffer }
  | { format: 'pptx'; data: ArrayBuffer }
