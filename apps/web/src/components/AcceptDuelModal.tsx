'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Duel } from '@/types/duel'
import { useDuel } from '@/hooks/useDuel'

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const focusable = el.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [active, ref])
}

const PLATFORM_PATTERNS = [
  /^https?:\/\//i,
  /steamcommunity\.com/i,
  /epicgames\.com/i,
  /riotgames\.com|op\.gg/i,
  /battlenet\.com|battle\.net/i,
  /ubisoft\.com/i,
  /ea\.com/i,
  /xbox\.com/i,
  /psn\.com|playstation\.com/i,
]

function validateFriendLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Friend link is required.'
  if (trimmed.length < 3) return 'Friend link is too short.'
  if (!PLATFORM_PATTERNS.some((p) => p.test(trimmed)))
    return 'Enter a valid invite link (Steam, Riot, Epic, etc.) or URL.'
  return null
}

function FinancialRow({ label, value, highlight, amber }: { label: string; value: string; highlight?: boolean; amber?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={['text-sm font-medium tabular-nums', highlight ? 'text-violet-400' : amber ? 'text-amber-400' : 'text-zinc-100'].join(' ')}>
        {value}
      </span>
    </div>
  )
}

export interface AcceptDuelModalProps {
  duel: Duel
  walletBalance: number
  onAccepted: () => void
  onClose: () => void
}

export function AcceptDuelModal({ duel, walletBalance, onAccepted, onClose }: AcceptDuelModalProps) {
  const titleId = useId()
  const descId = useId()
  const linkErrorId = useId()
  const balanceWarningId = useId()
  const apiErrorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const { isLoading, error: apiError, clearError, acceptDuel } = useDuel()
  const [friendLink, setFriendLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [hasBlurred, setHasBlurred] = useState(false)

  const hasInsufficientBalance = walletBalance < duel.stake
  const isLinkValid = validateFriendLink(friendLink) === null
  const canSubmit = isLinkValid && !hasInsufficientBalance && !isLoading

  useFocusTrap(dialogRef, true)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isLoading, onClose])

  const handleLinkChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setFriendLink(val)
    clearError()
    if (hasBlurred) setLinkError(validateFriendLink(val))
  }, [hasBlurred, clearError])

  const handleLinkBlur = useCallback(() => {
    setHasBlurred(true)
    setLinkError(validateFriendLink(friendLink))
  }, [friendLink])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateFriendLink(friendLink)
    if (err) { setHasBlurred(true); setLinkError(err); return }
    try {
      await acceptDuel(duel.id, friendLink)
      onAccepted()
    } catch { /* error set in hook */ }
  }, [friendLink, duel.id, acceptDuel, onAccepted])

  const initials = duel.creatorUsername.slice(0, 2).toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">Accept Duel</h2>
          <button type="button" aria-label="Close" disabled={isLoading} onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5 px-6 py-5">
            <div className="flex items-center gap-3">
              {duel.creatorAvatar ? (
                <img src={duel.creatorAvatar} alt={duel.creatorUsername} className="h-10 w-10 rounded-full object-cover ring-2 ring-zinc-800" />
              ) : (
                <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-900/60 text-sm font-semibold text-violet-300 ring-2 ring-zinc-800">
                  {initials}
                </div>
              )}
              <div>
                <p id={descId} className="text-xs text-zinc-500">Challenge from</p>
                <p className="text-sm font-medium text-zinc-100">{duel.creatorUsername}</p>
              </div>
              <span className="ml-auto rounded-md bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">{duel.game}</span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 divide-y divide-zinc-800">
              <FinancialRow label="Stake" value={`${duel.stake} SOL`} />
              <FinancialRow label="Platform fee" value={`${duel.fee} SOL`} />
              <FinancialRow label="Prize pool" value={`${duel.prizePool} SOL`} highlight />
              <FinancialRow label="Winner reward" value={`${duel.reward} SOL`} highlight />
              <FinancialRow label="Your balance" value={`${walletBalance.toFixed(4)} SOL`} amber={hasInsufficientBalance} />
            </div>

            {hasInsufficientBalance && (
              <div id={balanceWarningId} role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true">
                  <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                <p className="text-xs text-amber-400">
                  Insufficient balance. You need at least <strong>{duel.stake} SOL</strong> to accept this duel.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="friendLink" className="block text-sm font-medium text-zinc-300">Your friend / invite link</label>
              <p className="text-xs text-zinc-500">Paste your in-game friend link so the creator can add you.</p>
              <input
                id="friendLink"
                type="url"
                autoComplete="off"
                spellCheck={false}
                disabled={isLoading}
                value={friendLink}
                onChange={handleLinkChange}
                onBlur={handleLinkBlur}
                aria-invalid={linkError ? 'true' : 'false'}
                aria-describedby={linkError ? linkErrorId : undefined}
                placeholder="https://steamcommunity.com/id/..."
                className={[
                  'w-full rounded-lg border bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:ring-1',
                  linkError ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30' : 'border-zinc-800 focus:border-violet-500 focus:ring-violet-500/20',
                  'disabled:opacity-50',
                ].join(' ')}
              />
              {linkError && <p id={linkErrorId} role="alert" className="text-xs text-red-400">{linkError}</p>}
            </div>

            {apiError && (
              <div id={apiErrorId} role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-3 text-xs text-red-400">
                {apiError}
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-zinc-800 px-6 py-4">
            <button type="button" disabled={isLoading} onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} aria-busy={isLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Accepting…
                </>
              ) : 'Accept Duel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
