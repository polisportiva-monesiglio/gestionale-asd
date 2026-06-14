"use client"

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [stato, setStato] = useState<'idle' | 'invio' | 'inviato' | 'errore'>('idle')
  const [errore, setErrore] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStato('invio')
    setErrore('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setErrore(error.message)
      setStato('errore')
      return
    }

    setStato('inviato')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Accedi</h1>
        <p className="text-sm text-gray-500 mb-6">
          Inserisci la tua email: ti invieremo un link per accedere senza password.
        </p>

        {stato === 'inviato' ? (
          <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm p-4">
            Controlla la tua casella di posta e clicca sul link che ti abbiamo inviato per accedere.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="nome@esempio.it"
              />
            </div>

            {stato === 'errore' && (
              <p className="text-sm text-red-600">{errore}</p>
            )}

            <button
              type="submit"
              disabled={stato === 'invio'}
              className="w-full rounded-lg bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-gray-900 font-semibold py-2 transition-colors"
            >
              {stato === 'invio' ? 'Invio in corso...' : 'Invia link di accesso'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
