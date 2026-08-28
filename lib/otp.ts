import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashDatiFirma } from '@/lib/firmaHash'
import { testoSicuroHtml } from '@/lib/email'

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

  // Tetto ai tentativi per token: senza, le sei cifre si esauriscono a forza bruta.
  //
  // Con la chiave di servizio e non più con quella pubblica: queste tre
  // funzioni girano solo qui, che è codice di server, e finché erano
  // eseguibili anche dal ruolo anonimo chiunque poteva chiamare
  // azzera_tentativi_otp e rimettere a zero questo contatore, che è l'unica
  // cosa che impedisce di indovinare il codice a forza bruta.
  const supabase = createAdminClient()
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
  const supabase = createAdminClient()
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

const DURATA_OTP_MS = 10 * 60 * 1000 // 10 minuti

/**
 * Genera un codice di firma, lo spedisce e restituisce il token che lo lega
 * al contenuto dichiarato.
 *
 * Sta qui e non dentro una rotta perché i percorsi che firmano sono due: la
 * prima iscrizione e il rinnovo annuale. Erano destinati a diventare due
 * copie della stessa procedura, e due copie di un meccanismo di firma
 * divergono — è già successo una volta, quando l'indirizzo a cui spedire il
 * codice era scelto da una parte e verificato dall'altra, e per un minorenne
 * le due scelte non coincidevano.
 *
 * Il token non contiene il codice: contiene l'impronta HMAC di
 * `email:scadenza:codice:improntaDeiDati`. Chi lo intercetta non ricava il
 * codice, e chi cambia i dati dopo averlo ricevuto invalida la firma.
 */
export async function inviaCodiceFirma(params: {
  email: string
  nome: string | null
  dati: Record<string, unknown>
  ip: string
  /** Prefisso del contatore: i due percorsi non si rubano il budget a vicenda. */
  ambito?: string
}): Promise<{ ok: true; token: string } | { ok: false; errore: string; stato: number }> {
  const { email, nome, dati, ip } = params
  const ambito = params.ambito ?? 'rate-limit'

  const secret = process.env.OTP_SECRET
  if (!secret) {
    console.error('OTP_SECRET non configurato')
    return { ok: false, errore: 'Configurazione del server incompleta', stato: 500 }
  }

  // Tetto agli invii, per destinatario e per provenienza. Senza, questa strada
  // è aperta a due abusi: riempire la casella di un socio di codici che non ha
  // chiesto, e bruciare la quota Resend dell'ASD a spese di tutti. Il conteggio
  // sta su Postgres e non in memoria perché ogni richiesta può toccare
  // un'istanza serverless diversa: un contatore locale non vedrebbe gli invii
  // delle altre.
  //
  // L'indirizzo non viene passato in chiaro: alla tabella basta l'impronta per
  // contare, e l'HMAC con OTP_SECRET impedisce di risalire all'email provando
  // i candidati, cosa che un semplice sha256 non fermerebbe.
  const emailNormalizzata = email.trim().toLowerCase()
  const emailHash = crypto
    .createHmac('sha256', secret)
    .update(`${ambito}:${emailNormalizzata}`)
    .digest('hex')

  const admin = createAdminClient()
  const { data: esitoLimite, error: erroreLimite } = await admin
    .rpc('registra_invio_otp', { p_email_hash: emailHash, p_ip: ip })

  if (erroreLimite) {
    // Fallire aperti qui vorrebbe dire che basta far cadere il controllo per
    // riavere la rotta senza limiti: meglio negare.
    console.error('Errore rate limit invio OTP:', erroreLimite)
    return { ok: false, errore: 'Errore interno del server', stato: 500 }
  }

  if (esitoLimite !== 'ok') {
    return {
      ok: false,
      stato: 429,
      errore:
        esitoLimite === 'email'
          ? "Hai già richiesto troppi codici per questo indirizzo. Attendi un'ora e riprova."
          : "Troppe richieste da questa connessione. Attendi un'ora e riprova.",
    }
  }

  // Generatore crittografico: Math.random() produce una sequenza ricostruibile
  // osservandone abbastanza valori, e qui il numero estratto è il segreto che
  // vale la firma.
  const codice = crypto.randomInt(100000, 1000000).toString()
  const scadenza = Date.now() + DURATA_OTP_MS
  const datiHash = hashDatiFirma(dati)

  const firma = crypto
    .createHmac('sha256', secret)
    .update(`${email}:${scadenza}:${codice}:${datiHash}`)
    .digest('hex')
  const token = Buffer.from(`${email}:${scadenza}:${firma}:${datiHash}`).toString('base64')

  const esitoInvio = await spedisciCodice(email, nome, codice)
  if (!esitoInvio.ok) return esitoInvio

  return { ok: true, token }
}

async function spedisciCodice(
  email: string,
  nome: string | null,
  codice: string
): Promise<{ ok: true } | { ok: false; errore: string; stato: number }> {
  const chiave = process.env.RESEND_API_KEY
  if (!chiave) {
    console.error('RESEND_API_KEY non configurata: codice di firma non spedito')
    return { ok: false, errore: 'Configurazione del server incompleta', stato: 500 }
  }

  const { Resend } = await import('resend')
  const { error } = await new Resend(chiave).emails.send({
    // Dominio verificato su Resend: il mittente di prova onboarding@resend.dev
    // consegna soltanto all'email del titolare dell'account, quindi con quello
    // le iscrizioni dei soci fallivano con 403.
    from: 'Polisportiva Monesiglio <info@polisportiva-monesiglio.it>',
    to: email,
    subject: 'Codice OTP Tesseramento - ASD Monesiglio',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #facc15;">Polisportiva Monesiglio</h2>
        <p>Ciao ${testoSicuroHtml(nome) || 'Socio'},</p>
        <p>Ecco il tuo codice per firmare:</p>
        <div style="background-color: #facc15; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; color: #111827;">
          ${codice}
        </div>
        <p style="font-size: 12px; color: #888; margin-top: 16px;">Il codice è valido per 10 minuti.</p>
      </div>
    `,
  })

  if (error) {
    console.error('Errore Resend:', error)
    return { ok: false, errore: error.message, stato: 400 }
  }
  return { ok: true }
}
