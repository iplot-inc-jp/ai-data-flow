'use client'

import { useEffect, useRef } from 'react'

export type Shortcut = {
  combo: string
  handler: (e: KeyboardEvent) => void
  whenTyping?: boolean
}

type ParsedCombo = {
  mod: boolean
  shift: boolean
  alt: boolean
  key: string
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)

  const parsed: ParsedCombo = {
    mod: false,
    shift: false,
    alt: false,
    key: '',
  }

  for (const part of parts) {
    if (part === 'mod' || part === 'cmd' || part === 'ctrl' || part === 'meta') {
      parsed.mod = true
    } else if (part === 'shift') {
      parsed.shift = true
    } else if (part === 'alt' || part === 'option') {
      parsed.alt = true
    } else {
      parsed.key = part
    }
  }

  return parsed
}

function eventKey(e: KeyboardEvent): string {
  const key = e.key.toLowerCase()
  // Normalize common aliases.
  if (key === ' ' || key === 'spacebar') return 'space'
  if (key === 'esc') return 'escape'
  if (key === 'del') return 'delete'
  return key
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

function matches(e: KeyboardEvent, combo: ParsedCombo): boolean {
  const mod = e.metaKey || e.ctrlKey
  if (combo.mod !== mod) return false
  if (combo.shift !== e.shiftKey) return false
  if (combo.alt !== e.altKey) return false
  return eventKey(e) === combo.key
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  const shortcutsRef = useRef<Shortcut[]>(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = isTypingTarget(e.target)

      for (const sc of shortcutsRef.current) {
        const parsed = parseCombo(sc.combo)
        if (!matches(e, parsed)) continue

        // Always allow escape and any mod-combo even while typing;
        // otherwise respect whenTyping.
        const alwaysAllowed = parsed.key === 'escape' || parsed.mod
        if (typing && !sc.whenTyping && !alwaysAllowed) continue

        if (parsed.mod) {
          e.preventDefault()
        }
        sc.handler(e)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
