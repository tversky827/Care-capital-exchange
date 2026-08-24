/** Tiny XML helpers — enough for the Office XML shapes we read, no more. */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
}

/** Returns the inner text of every occurrence of `<tag ...>...</tag>`. */
export function collectTagText(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  const out: string[] = []
  for (const match of xml.matchAll(pattern)) {
    out.push(decodeXmlEntities(stripTags(match[1] ?? '')))
  }
  return out
}

export function stripTags(xml: string): string {
  return xml.replace(/<[^>]*>/g, '')
}

export function attr(fragment: string, name: string): string | null {
  const match = fragment.match(new RegExp(`${name}="([^"]*)"`))
  return match ? decodeXmlEntities(match[1]!) : null
}
