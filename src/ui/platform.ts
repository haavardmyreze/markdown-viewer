/** True on macOS/iOS, where shortcuts use ⌘ instead of Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  const platform = navigator.platform ?? navigator.userAgent ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** The modifier key label for the current platform: "⌘" on Apple, "Ctrl" elsewhere. */
export function modifierKeyLabel(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl'
}
