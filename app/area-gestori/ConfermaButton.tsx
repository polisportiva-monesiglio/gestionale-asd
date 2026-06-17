'use client'

import { useActionState } from 'react'
import { confermaPagamento } from './actions'

export function ConfermaButton({ abbonamentoId }: { abbonamentoId: string }) {
  const [state, action, isPending] = useActionState(confermaPagamento, null)

  if (state?.ok) {
    return (
      <div className="text-right space-y-1">
        <p className="text-xs font-semibold text-green-600">✓ {state.message}</p>
        {state.ricevutaPath && (
          <a
            href={`/api/ricevuta-download?path=${encodeURIComponent(state.ricevutaPath)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-blue-600 underline"
          >
            Scarica ricevuta PDF
          </a>
        )}
      </div>
    )
  }

  return (
    <form action={action} className="text-right">
      <input type="hidden" name="abbonamento_id" value={abbonamentoId} />
      {state?.ok === false && (
        <p className="text-xs text-red-500 mb-1">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
      >
        {isPending ? 'Conferma in corso…' : 'Conferma pagamento'}
      </button>
    </form>
  )
}
