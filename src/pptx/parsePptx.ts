import JSZip from 'jszip'

export type PptxSlide = {
  index: number
  paragraphs: string[]
  images: string[]
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

function resolveRelativePath(basePath: string, target: string): string {
  const baseParts = basePath.split('/').slice(0, -1)
  const targetParts = target.split('/')

  for (const part of targetParts) {
    if (part === '.' || part === '') {
      continue
    }
    if (part === '..') {
      baseParts.pop()
    } else {
      baseParts.push(part)
    }
  }

  return baseParts.join('/')
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

/** Maps r:id -> target path, resolved relative to the .rels file's owner. */
function parseRelationships(relsXml: Document, ownerPath: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const rel of Array.from(relsXml.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) {
      map.set(id, resolveRelativePath(ownerPath, target))
    }
  }
  return map
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path)
  if (!file) {
    return null
  }
  return file.async('string')
}

/** Ordered list of slide XML paths, following presentation.xml's own slide order. */
async function orderedSlidePaths(zip: JSZip): Promise<string[]> {
  const presentationXmlText = await readText(zip, 'ppt/presentation.xml')
  const relsXmlText = await readText(zip, 'ppt/_rels/presentation.xml.rels')
  if (!presentationXmlText || !relsXmlText) {
    return []
  }

  const rels = parseRelationships(parseXml(relsXmlText), 'ppt/presentation.xml')
  const presentationXml = parseXml(presentationXmlText)
  const sldIds = Array.from(presentationXml.getElementsByTagName('p:sldId'))

  const paths: string[] = []
  for (const sldId of sldIds) {
    const rId = sldId.getAttribute('r:id')
    const path = rId ? rels.get(rId) : undefined
    if (path) {
      paths.push(path)
    }
  }
  return paths
}

function extractParagraphs(slideXml: Document): string[] {
  const paragraphs: string[] = []
  for (const paragraph of Array.from(slideXml.getElementsByTagName('a:p'))) {
    const text = Array.from(paragraph.getElementsByTagName('a:t'))
      .map((node) => node.textContent ?? '')
      .join('')
      .trim()
    if (text) {
      paragraphs.push(text)
    }
  }
  return paragraphs
}

async function extractImages(
  zip: JSZip,
  slideXml: Document,
  slideRels: Map<string, string>,
): Promise<string[]> {
  const images: string[] = []
  const seen = new Set<string>()

  for (const blip of Array.from(slideXml.getElementsByTagName('a:blip'))) {
    const rId = blip.getAttribute('r:embed')
    const path = rId ? slideRels.get(rId) : undefined
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)

    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    const mime = IMAGE_MIME_BY_EXTENSION[extension]
    if (!mime) {
      continue // vector/unsupported format (emf, wmf, …) — browsers can't render it
    }

    const file = zip.file(path)
    if (!file) {
      continue
    }

    const base64 = await file.async('base64')
    images.push(`data:${mime};base64,${base64}`)
  }

  return images
}

/**
 * Rough, client-side pptx parse: extracts each slide's text and raster
 * images in presentation order. There's no layout/formatting fidelity —
 * this is a fallback reading experience, not a slide renderer.
 */
export async function parsePptx(data: ArrayBuffer): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(data)
  const slidePaths = await orderedSlidePaths(zip)

  const slides: PptxSlide[] = []
  for (let index = 0; index < slidePaths.length; index += 1) {
    const slidePath = slidePaths[index]
    const slideXmlText = await readText(zip, slidePath)
    if (!slideXmlText) {
      continue
    }

    const slideXml = parseXml(slideXmlText)
    const relsPath = `${slidePath.split('/').slice(0, -1).join('/')}/_rels/${slidePath.split('/').pop()}.rels`
    const relsXmlText = await readText(zip, relsPath)
    const slideRels = relsXmlText
      ? parseRelationships(parseXml(relsXmlText), slidePath)
      : new Map<string, string>()

    const paragraphs = extractParagraphs(slideXml)
    const images = await extractImages(zip, slideXml, slideRels)

    slides.push({ index, paragraphs, images })
  }

  return slides
}
