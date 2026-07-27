// Real thumbnails for library cards. Captured opportunistically when a
// document renders in its reader (PDF first page, decoded image), stored as
// small JPEG data URLs in localStorage with LRU eviction. The library falls
// back to the stylized format preview when no capture exists yet.

const STORAGE_KEY = 'qr-doc-thumbs-v1'
const MAX_ENTRIES = 36
const THUMB_WIDTH = 400
const THUMB_MAX_HEIGHT = 560

type ThumbStore = Record<string, string>

function loadStore(): ThumbStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as ThumbStore
    }
  } catch {
    // Corrupt or unavailable storage — behave as empty.
  }
  return {}
}

function persistStore(store: ThumbStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function loadDocumentThumbnail(docKey: string): string | null {
  return loadStore()[docKey] ?? null
}

/** Downscale a rendered canvas and remember it for the library card. */
export function saveDocumentThumbnail(docKey: string, source: HTMLCanvasElement) {
  if (!docKey || source.width === 0 || source.height === 0) {
    return
  }

  try {
    const scale = Math.min(1, THUMB_WIDTH / source.width)
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(
      1,
      Math.min(THUMB_MAX_HEIGHT, Math.round(source.height * scale)),
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    // Paint on white first: PDF pages and transparent images should read as
    // paper, not as the card's dark backdrop showing through.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    // Top crop for tall sources — the card shows the head of the document.
    const sourceHeight = Math.min(source.height, height / scale)
    context.drawImage(
      source,
      0,
      0,
      source.width,
      sourceHeight,
      0,
      0,
      width,
      height,
    )

    const dataUrl = canvas.toDataURL('image/jpeg', 0.72)

    const store = loadStore()
    // Re-insert to refresh LRU order (object key order is insertion order).
    delete store[docKey]
    store[docKey] = dataUrl
    const keys = Object.keys(store)
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      delete store[stale]
    }

    try {
      persistStore(store)
    } catch {
      // Quota exceeded — drop the older half and retry once.
      const remaining = Object.keys(store)
      for (const stale of remaining.slice(0, Math.ceil(remaining.length / 2))) {
        if (stale !== docKey) {
          delete store[stale]
        }
      }
      try {
        persistStore(store)
      } catch {
        // Storage genuinely unavailable — thumbnails stay best-effort.
      }
    }
  } catch {
    // Tainted canvas or storage failure — fall back to the stylized preview.
  }
}
