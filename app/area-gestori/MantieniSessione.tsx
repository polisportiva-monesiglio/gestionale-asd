'use client'

import { useEffect } from 'react'

// Il token di accesso vive un'ora. Si tocca la sessione ben prima, cosi' il
// rinnovo capita sempre a bocce ferme e mai in mezzo a un'operazione.
const OGNI_MS = 20 * 60 * 1000

/**
 * Non disegna niente: tiene solo viva la sessione del gestore finche' la
 * scheda e' aperta, e se la sessione e' davvero finita ricarica, cosi' il
 * proxy porta al login invece di lasciare un modulo che fallira' al primo
 * invio.
 */
export function MantieniSessione() {
  useEffect(() => {
    let vivo = true

    async function tocca() {
      try {
        const risposta = await fetch('/api/sessione', { cache: 'no-store' })
        if (!vivo || !risposta.ok) return
        const esito = await risposta.json()
        // Solo un "no" esplicito porta al login: un guasto di rete non e' una
        // sessione scaduta, e cacciare fuori un gestore per un pacchetto perso
        // sarebbe peggio del problema che stiamo risolvendo.
        if (esito?.attiva === false) window.location.reload()
      } catch {
        // Rete assente o richiesta interrotta: si riprova al giro dopo.
      }
    }

    const battito = setInterval(tocca, OGNI_MS)

    // Tornare sulla scheda dopo ore e' il momento in cui il token e' piu'
    // probabilmente scaduto: si rinnova subito, prima che il gestore clicchi.
    const alRitorno = () => {
      if (document.visibilityState === 'visible') tocca()
    }
    document.addEventListener('visibilitychange', alRitorno)

    return () => {
      vivo = false
      clearInterval(battito)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [])

  return null
}
