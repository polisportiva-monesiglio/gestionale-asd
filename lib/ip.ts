import type { NextRequest } from 'next/server'
import { ipAddress } from '@vercel/functions'

/**
 * L'indirizzo da cui arriva la richiesta, per come lo vede il server.
 *
 * Su Vercel è la piattaforma a stabilire questo valore: non è modificabile dal
 * client, a differenza di quanto accadeva quando l'IP veniva chiesto al browser
 * e da lui rispedito insieme ai dati.
 *
 * Vive qui perché serve a due percorsi diversi con esigenze diverse: alla firma
 * come dato probatorio, al rate limit dell'OTP come chiave di conteggio. Averne
 * due copie significherebbe, prima o poi, correggerne una sola.
 */
export function ipDellaRichiesta(req: NextRequest): string {
  const daPiattaforma = ipAddress(req)
  if (daPiattaforma) return daPiattaforma

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'non rilevato'
}
