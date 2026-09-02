import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnnoSportivo } from '@/lib/stagione'
import { nomeFileModulo, MASSIMO_RAGIONEVOLE, type RigaUisp } from '@/lib/uisp'
import { compilaModuloUisp } from '@/lib/uispServer'

// exceljs legge il modello dal disco: serve il runtime Node, non l'edge.
export const runtime = 'nodejs'

const CAMPI_SOCIO =
  'cognome, nome, sesso, data_nascita, luogo_nascita, provincia_nascita, cf, indirizzo, citta, email, telefono'

type SocioUisp = {
  cognome: string | null
  nome: string | null
  sesso: string | null
  data_nascita: string | null
  luogo_nascita: string | null
  provincia_nascita: string | null
  cf: string | null
  indirizzo: string | null
  citta: string | null
  email: string | null
  telefono: string | null
}

// PostgREST restituisce le relazioni annidate ora come oggetto, ora come array
// di un elemento. Il resto del progetto le legge in entrambe le forme e qui
// serve lo stesso: dando per scontato l'oggetto, ogni riga del modulo uscirebbe
// vuota senza che nulla segnali l'errore.
type TesseramentoConSocio = { id: string; soci: SocioUisp | SocioUisp[] | null }

function socioDi(t: TesseramentoConSocio): SocioUisp | null {
  return Array.isArray(t.soci) ? (t.soci[0] ?? null) : t.soci
}

function inRiga(socio: SocioUisp | null): RigaUisp {
  return {
    cognome: socio?.cognome ?? null,
    nome: socio?.nome ?? null,
    sesso: socio?.sesso ?? null,
    dataNascita: socio?.data_nascita ?? null,
    luogoNascita: socio?.luogo_nascita ?? null,
    provinciaNascita: socio?.provincia_nascita ?? null,
    cf: socio?.cf ?? null,
    indirizzo: socio?.indirizzo ?? null,
    citta: socio?.citta ?? null,
    email: socio?.email ?? null,
    telefono: socio?.telefono ?? null,
  }
}

function comeAllegato(file: Buffer, nome: string) {
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Chi sta chiamando è un gestore attivo? La riga serve anche per firmare l'invio. */
async function gestoreCorrente() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  return data
}

/**
 * Genera il modulo per i tesseramenti scelti e li segna come inviati.
 *
 * L'ordine conta: prima si prenotano le righe con un aggiornamento condizionato
 * a `invio_uisp_id is null`, poi si costruisce il file su quello che si è
 * riusciti a prenotare davvero. Se due gestori premono il pulsante insieme, il
 * secondo non si porta dietro i soci già presi dal primo.
 */
export async function POST(req: NextRequest) {
  const gestore = await gestoreCorrente()
  if (!gestore) return NextResponse.json({ error: 'Accesso negato.' }, { status: 403 })

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non leggibile.' }, { status: 400 })
  }

  const richiesti = (corpo as { tesseramentoIds?: unknown })?.tesseramentoIds
  const ids = Array.isArray(richiesti) ? richiesti.filter((v): v is string => typeof v === 'string') : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Non hai selezionato nessun socio.' }, { status: 400 })
  }
  if (ids.length > MASSIMO_RAGIONEVOLE) {
    // Il modulo si allunga quanto serve: questo tetto non e' la capienza del
    // foglio, e' il confine oltre il quale la richiesta e' un errore.
    return NextResponse.json(
      { error: `Hai chiesto ${ids.length} soci in un colpo solo: e' troppo.` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const annoSportivo = getAnnoSportivo()

  // Numero progressivo per stagione, come i file su Drive ("3 - Modulo ...").
  const { data: ultimo } = await admin
    .from('invii_uisp')
    .select('numero')
    .eq('anno_sportivo', annoSportivo)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  const numero = (ultimo?.numero ?? 0) + 1

  const { data: invio, error: invioErr } = await admin
    .from('invii_uisp')
    .insert({ anno_sportivo: annoSportivo, numero, gestore_id: gestore.id, conteggio: 0 })
    .select('id, numero')
    .single()

  if (invioErr || !invio) {
    // Il vincolo unico (stagione, numero) scatta se due gestori generano insieme.
    return NextResponse.json(
      { error: 'Un altro invio è stato creato in questo momento. Riprova.' },
      { status: 409 }
    )
  }

  // Prenotazione: passano solo i tesseramenti ancora liberi e di questa stagione.
  const { data: prenotati, error: prenotaErr } = await admin
    .from('tesseramenti_annuali')
    .update({ invio_uisp_id: invio.id })
    .in('id', ids)
    .eq('anno_sportivo', annoSportivo)
    .is('invio_uisp_id', null)
    .select(`id, soci!inner(${CAMPI_SOCIO})`)

  if (prenotaErr) {
    await admin.from('invii_uisp').delete().eq('id', invio.id)
    return NextResponse.json({ error: `Marcatura fallita: ${prenotaErr.message}` }, { status: 500 })
  }

  const righe = (prenotati ?? []) as unknown as TesseramentoConSocio[]
  if (righe.length === 0) {
    // Nessuno era ancora da mandare: l'invio non è mai esistito davvero.
    await admin.from('invii_uisp').delete().eq('id', invio.id)
    return NextResponse.json(
      { error: 'Questi soci risultano già inviati. Ricarica la pagina.' },
      { status: 409 }
    )
  }

  await admin.from('invii_uisp').update({ conteggio: righe.length }).eq('id', invio.id)

  try {
    const file = await compilaModuloUisp(righe.map(t => inRiga(socioDi(t))))
    return comeAllegato(file, nomeFileModulo(invio.numero, annoSportivo))
  } catch (e) {
    // Il file non è uscito: le righe devono tornare da mandare, o resterebbero
    // marcate come spedite senza che nulla sia mai stato spedito.
    await admin.from('tesseramenti_annuali').update({ invio_uisp_id: null }).eq('invio_uisp_id', invio.id)
    await admin.from('invii_uisp').delete().eq('id', invio.id)
    console.error('Generazione del modulo UISP fallita:', e)
    return NextResponse.json({ error: 'Generazione del file fallita.' }, { status: 500 })
  }
}

/** Riscarica un invio già fatto, ricostruito dai tesseramenti ancora collegati. */
export async function GET(req: NextRequest) {
  const gestore = await gestoreCorrente()
  if (!gestore) return new NextResponse('Accesso negato', { status: 403 })

  const invioId = req.nextUrl.searchParams.get('invio_id')
  if (!invioId) return new NextResponse('Parametro mancante', { status: 400 })

  const admin = createAdminClient()

  const { data: invio } = await admin
    .from('invii_uisp')
    .select('id, numero, anno_sportivo')
    .eq('id', invioId)
    .maybeSingle()

  if (!invio) return new NextResponse('Invio non trovato', { status: 404 })

  const { data: righeRaw } = await admin
    .from('tesseramenti_annuali')
    .select(`id, soci!inner(${CAMPI_SOCIO})`)
    .eq('invio_uisp_id', invio.id)

  const righe = (righeRaw ?? []) as unknown as TesseramentoConSocio[]

  if (righe.length === 0) {
    return new NextResponse('Questo invio non ha più soci collegati', { status: 404 })
  }

  const file = await compilaModuloUisp(righe.map(t => inRiga(socioDi(t))))
  return comeAllegato(file, nomeFileModulo(invio.numero, invio.anno_sportivo))
}
