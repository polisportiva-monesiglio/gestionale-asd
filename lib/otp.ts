import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { hashDatiFirma } from '@/lib/firmaHash'

const MAX_TENTATIVI = 5

export type EsitoOtp =
  | { valido: true; otpHash: string; tokenHash: string }
  | { valido: false; errore: string; stato: number }

/**
 * Verifica un OTP senza consumarlo.
 *
 * Vive qui e non in una rotta HTTP perché è il cardine della firma: deve poter
 * essere chiamata *dentro* la stessa richiesta che scrive l'iscrizione, così
 * fra la verifica e la scrittura non può inserirsi nessuno. Finché la verifica
 * era una rotta a sé, il browser era libero di ignorarne l'esito.
 *
 * Il consumo è separato (vedi `consumaOtp`) perché fra i due passaggi il
 * chiamante deve poter rifiutare l'iscrizione per motivi suoi — un codice
 * fiscale già presente, ad esempio — senza bruciare il codice del socio.
 */
export async function verificaOtp(params: {
  email: string
  codice: string
  token: string
  dati: Record<string, unknown>
}): Promise<EsitoOtp> {
  const { email, codice, token, dati } = params

  const secret = process.env.OTP_SECRET
  if (!secret) {
    console.error('OTP_SECRET non configurato')
    return { valido: false, errore: 'Configurazione del server incompleta', stato: 500 }
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Tetto ai tentativi per token: senza, le sei cifre si esauriscono a forza bruta
  const { data: tentativi, error: tentativiErr } = await supabase
    .rpc('incrementa_tentativo_otp', { p_token_hash: tokenHash })

  if (tentativiErr) {
    console.error('Errore rate limit OTP:', tentativiErr)
    return { valido: false, errore: 'Errore interno del server', stato: 500 }
  }
  if ((tentativi ?? 0) > MAX_TENTATIVI) {
    return {
      valido: false,
      errore: 'Troppi tentativi falliti. Richiedi un nuovo codice OTP.',
      stato: 429,
    }
  }

  let decoded: string
  try {
    decoded = Buffer.from(token, 'base64').toString('utf-8')
  } catch {
    return { valido: false, errore: 'Token non valido', stato: 400 }
  }

  const parti = decoded.split(':')
  if (parti.length !== 4) return { valido: false, errore: 'Token non valido', stato: 400 }

  const [tokenEmail, scadenzaStr, firmaAttesa, datiHashToken] = parti
  const scadenza = Number(scadenzaStr)

  if (tokenEmail !== email || !Number.isFinite(scadenza)) {
    return { valido: false, errore: 'Token non valido', stato: 400 }
  }
  if (Date.now() > scadenza) {
    return { valido: false, errore: 'Il codice OTP è scaduto. Richiedine uno nuovo.', stato: 400 }
  }

  const firmaCalcolata = crypto
    .createHmac('sha256', secret)
    .update(`${email}:${scadenza}:${codice}:${datiHashToken}`)
    .digest('hex')

  if (firmaAttesa.length !== firmaCalcolata.length) {
    return { valido: false, errore: 'Codice OTP non corretto', stato: 400 }
  }

  let corrisponde: boolean
  try {
    corrisponde = crypto.timingSafeEqual(
      Buffer.from(firmaAttesa, 'hex'),
      Buffer.from(firmaCalcolata, 'hex')
    )
  } catch {
    return { valido: false, errore: 'Token non valido', stato: 400 }
  }
  if (!corrisponde) return { valido: false, errore: 'Codice OTP non corretto', stato: 400 }

  // Il contenuto dichiarato deve essere identico a quello presente quando l'OTP
  // è stato richiesto: l'OTP autentica il documento, non solo l'indirizzo email.
  if (hashDatiFirma(dati) !== datiHashToken) {
    return {
      valido: false,
      errore: 'I dati inseriti sono cambiati rispetto alla richiesta del codice OTP. Richiedi un nuovo codice.',
      stato: 400,
    }
  }

  // Riferimento per l'audit trail: non rivela l'OTP in chiaro
  const otpHash = crypto.createHash('sha256').update(`${email}:${scadenza}:${codice}`).digest('hex')
  return { valido: true, otpHash, tokenHash }
}

/**
 * Consuma definitivamente un OTP già verificato: vale per una sola firma.
 * Senza questo passaggio lo stesso codice resterebbe spendibile fino alla
 * scadenza. Restituisce false se era già stato speso.
 */
export async function consumaOtp(tokenHash: string): Promise<boolean> {
  const { data: primoUso, error } = await supabase
    .rpc('consuma_token_otp', { p_token_hash: tokenHash })

  if (error) {
    console.error('Errore consumo token OTP:', error)
    return false
  }
  if (!primoUso) return false

  await supabase.rpc('azzera_tentativi_otp', { p_token_hash: tokenHash })
  return true
}
