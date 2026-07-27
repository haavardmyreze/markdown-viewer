// The canonical topbar actions every format reader composes from. One
// definition per surface — label, icon, and shortcut can never drift
// between formats.

import type { TopbarAction } from './ReaderTopbar'
import { AskIcon, CommentsIcon, ContentsIcon, PresentIcon, SearchIcon } from './icons'

export function createTocTopbarAction(open: boolean, onToggle: () => void): TopbarAction {
  return {
    id: 'toc',
    label: 'Contents',
    icon: <ContentsIcon />,
    active: open,
    onToggle,
  }
}

export function createSearchTopbarAction(
  active: boolean,
  onToggle: () => void,
): TopbarAction {
  return {
    id: 'search',
    label: 'Search',
    icon: <SearchIcon />,
    active,
    shortcut: '/',
    onToggle,
  }
}

export function createCommentsTopbarAction(
  open: boolean,
  count: number,
  onToggle: () => void,
): TopbarAction {
  return {
    id: 'comments',
    label: 'Comments',
    icon: <CommentsIcon />,
    active: open,
    badge: count || undefined,
    onToggle,
  }
}

export function createAskTopbarAction(open: boolean, onToggle: () => void): TopbarAction {
  return {
    id: 'assistant',
    label: 'Ask',
    icon: <AskIcon />,
    active: open,
    onToggle,
  }
}

/** Draw + laser fold into one Present toggle; tools live in the floating cluster. */
export function createPresentTopbarAction(
  presentActive: boolean,
  togglePresent: () => void,
): TopbarAction {
  return {
    id: 'present',
    label: 'Present',
    icon: <PresentIcon />,
    active: presentActive,
    shortcut: 'L',
    onToggle: togglePresent,
  }
}
