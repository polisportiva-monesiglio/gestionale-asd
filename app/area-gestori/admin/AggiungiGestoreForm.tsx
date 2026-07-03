'use client'

import { useActionState, useRef, useEffect } from 'react'
import { invitaGestore } from './actions'
import { Spinner } from '@/app/components/Spinner'

export function AggiungiGestoreForm() {
  const [state, action, isPending] = useActionState(invitaGestore, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-3">
      <input
        name="nome"
        type="text"
        placeholder="Nome"
        className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="email@esempio.it"
        className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        name="telefono"
        type="tel"
        placeholder="Cellulare (es. 347 1234567)"
        className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
      >
        {isPending && <Spinner className="h-3.5 w-3.5" />}
        {isPending ? 'Aggiungo…' : 'Aggiungi gestore'}
      </button>
      {state?.ok && <span className="text-xs text-green-600 font-medium">✓ {state.message}</span>}
      {state?.ok === false && <span className="text-xs text-red-500">{state.error}</span>}
    </form>
  )
}
