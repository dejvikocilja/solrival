import { AcceptDuelPayload, Duel, DuelApiError, DuelErrorCode } from '@/types/duel'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

interface ApiFetchOptions extends RequestInit {
  getToken?: () => string | null
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { getToken, ...init } = options

  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  const token = getToken?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    let code: DuelErrorCode = 'UNKNOWN'
    let message = res.statusText
    try {
      const body = await res.json()
      if (body?.code) code = body.code as DuelErrorCode
      if (body?.message) message = body.message
    } catch { /* non-JSON body */ }
    throw new DuelApiError(code, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function getDuel(duelId: string): Promise<Duel> {
  return apiFetch<Duel>(`/api/duels/${duelId}`)
}

export async function acceptDuel(duelId: string, payload: AcceptDuelPayload): Promise<void> {
  return apiFetch<void>(`/api/duels/${duelId}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
