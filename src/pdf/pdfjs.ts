// The legacy build self-polyfills Promise.withResolvers/Promise.try, which
// the main build assumes natively — without it, PDFs fail to load on any
// Safari older than 17.4 (spring 2024), throwing deep inside the worker.
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// Safari didn't add ReadableStream async iteration until 16.4 (March 2023).
// pdf.js's getTextContent() reads its own internal stream with a native
// `for await...of`, so on older Safari it throws "undefined is not a
// function (near '...value of readableStream...')" — it runs on every page
// during load, so this breaks loading entirely. This module is imported
// once, before any pdf.js API is called, so the polyfill lands in time.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = function (this: ReadableStream) {
    const reader = this.getReader()
    return (async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            return
          }
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    })() as ReturnType<Exclude<typeof ReadableStream.prototype.values, undefined>>
  }
}
