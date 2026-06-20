import { useCallback, useState } from 'react'
import { acceptDuel as acceptDuelApi } from '@/api/duels'
import { DuelApiError } from '@/types/duel'

interface UseDuelReturn {
  isLoading: boolean
  error: string | null
  clearError: () => void
  acceptDuel: (duelId: string, friendLink: string) => Promise<void>
}

export function useDuel(): UseDuelReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const acceptDuel = useCallback(async (duelId: string, friendLink: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await acceptDuelApi(duelId, { duelId, friendLink })
    } catch (err) {
      const message = err instanceof DuelApiError ? err.toUserMessage() : 'Something went wrong. Please try again.'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { isLoading, error, clearError, acceptDuel }
}
