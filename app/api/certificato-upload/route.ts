import { type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ipDellaRichiesta } from '@/lib/ip'

const ARCHIVIO = 'certificati-medici'

// Le stesse estensioni che il bucket accetta come tipo. L'elenco sta qui
// perche' il nome del file lo compone il server, non il browser: senza,
// basterebbe dichiarare un'estensione qualsiasi per depositare nell'archivio
// un file con un nome che non dice cosa contiene.
const ESTENSIONI: Record<string, string> = {
  pdf: 'pdf',
  jpg: 'jpg', jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  heic: 'heic',
}

/**
 * Il permesso di caricare un certificato, firmato dal server.
 *
 * Il file non passa di qui: un PDF fino a 10 MB non entrerebbe nei limiti di
 * corpo di una funzione. Passa di qui l'*autorizzazione* — un collegamento
 * firmato, valido per un percorso solo e per pochi minuti — e il browser
 * carica direttamente sull'archivio come faceva prima.
 *
 * Serve perche' il caricamento avviene prima della firma, quindi prima che
 * esista un account: finche' la policy dell'archivio era aperta al ruolo
 * anonimo, chiunque avesse la chiave pubblica poteva depositare file senza
 * limite e senza lasciare traccia di sé. Qui invece si conta la provenienza,
 * e il percorso lo decide il server.
 */
export async function POST(req: NextRequest) {
  let estensioneRichiesta: string
  try {
    const corpo = await req.json()
    estensioneRichiesta = String(corpo?.estensione ?? 'pdf').toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const estensione = ESTENSIONI[estensioneRichiesta]
  if (!estensione) {
    return NextResponse.json(
      { error: 'Il certificato deve essere un PDF o una foto (JPG, PNG, WEBP, HEIC).' },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('Client di servizio non disponibile:', e)
    return NextResponse.json({ error: 'Configurazione del server incompleta' }, { status: 500 })
  }

  const { data: esito, error: erroreLimite } = await admin
    .rpc('registra_upload_certificato', { p_ip: ipDellaRichiesta(req) })

  if (erroreLimite) {
    // Come per gli OTP: fallire aperti qui vorrebbe dire che basta far cadere
    // il controllo per riavere la rotta senza limiti.
    console.error('Errore rate limit upload certificato:', erroreLimite)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }

  if (esito !== 'ok') {
    return NextResponse.json(
      { error: "Troppi caricamenti da questa connessione. Attendi un'ora e riprova." },
      { status: 429 }
    )
  }

  // Nome casuale: il percorso di un documento sanitario non deve contenere
  // nome e cognome dell'interessato. Lo compone il server anche perche' il
  // collegamento firmato vale per questo percorso e per nessun altro.
  const percorso = `iscrizioni/${crypto.randomUUID()}.${estensione}`

  const { data, error } = await admin.storage
    .from(ARCHIVIO)
    .createSignedUploadUrl(percorso)

  if (error || !data) {
    console.error('Firma del caricamento fallita:', error?.message)
    return NextResponse.json({ error: 'Non è stato possibile preparare il caricamento.' }, { status: 500 })
  }

  return NextResponse.json({ percorso: data.path, token: data.token })
}
