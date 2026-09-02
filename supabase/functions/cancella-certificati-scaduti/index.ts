import { createClient } from 'npm:@supabase/supabase-js@2'

const ARCHIVIO = 'certificati-medici'

/**
 * Cancella i certificati medici il cui termine di conservazione è decorso.
 *
 * L'informativa consegnata ai soci dichiara: "Certificati medici: fino al
 * termine della stagione sportiva di riferimento e per l'anno successivo,
 * dopodiché vengono cancellati". Questa funzione è ciò che rende vera
 * quella frase; finché non esisteva, l'Associazione dichiarava per iscritto
 * una cosa che non faceva, per giunta su dati sanitari.
 *
 * Il termine si ancora alla STAGIONE del certificato, non alla sua data di
 * scadenza: è la stagione il "riferimento" di cui parla l'informativa, e due
 * certificati della stessa stagione devono sparire insieme anche se scadono a
 * mesi di distanza.
 */

/** La stagione A/B finisce il 14 agosto di B; più un anno, si cancella dal 15 agosto di B+1. */
function terminePassato(annoSportivo: string | null, oggi: Date): boolean | null {
  if (!annoSportivo) return null
  const fine = Number(annoSportivo.split('/')[1])
  if (!Number.isFinite(fine)) return null
  // Mese 7 = agosto. UTC perché il confronto è fra date intere, non fra istanti.
  return oggi >= new Date(Date.UTC(fine + 1, 7, 15))
}

type Riga = { id: string; anno_sportivo: string | null; url_certificato_pdf: string | null }

/** Giorni dopo i quali un file caricato e mai collegato si considera abbandonato. */
const GIORNI_PRIMA_DI_BUTTARE_UN_ORFANO = 7

/**
 * I certificati caricati e mai collegati a un'iscrizione.
 *
 * Nel modulo pubblico il certificato si carica prima di firmare, quindi prima
 * che esista una riga che lo richiami. Chi non arriva in fondo — sbaglia il
 * codice, chiude la scheda, scopre di essere gia' iscritto — lascia il file
 * nell'archivio senza che nessuna riga lo nomini. La cancellazione qui sopra
 * parte dai riferimenti in tabella, quindi un file che nessuna riga nomina non
 * entra nemmeno nell'elenco dei candidati: non viene trattenuto, proprio non
 * viene guardato. Restava li' per sempre, contro quanto dichiara l'informativa,
 * e su un documento sanitario.
 *
 * La soglia dei giorni non e' prudenza sprecata: fra il caricamento e la firma
 * passano minuti, ma un socio puo' interrompersi e riprendere piu' tardi, e un
 * file cancellato mentre lui sta ancora compilando gli farebbe fallire
 * l'iscrizione senza capire perche'.
 */
async function orfaniDaButtare(
  supabase: ReturnType<typeof createClient>,
  adesso: Date
): Promise<{ percorsi: string[]; errore: string | null }> {
  // Tutti i riferimenti esistenti, non solo quelli nei termini: un file
  // nominato da una riga qualsiasi non e' un orfano, qualunque sia la sua eta'.
  //
  // Si legge a pagine, e non in un colpo solo, perche' PostgREST tronca le
  // risposte a mille righe. Un elenco troncato qui non fa cancellare di meno:
  // fa cancellare di piu'. I file richiamati dalle righe cadute fuori dalla
  // prima pagina sembrerebbero orfani, e verrebbero distrutti pur essendo
  // certificati di soci in regola. E' il verso opposto rispetto alla passata
  // sugli scaduti, dove un elenco corto e' innocuo.
  const nominati = new Set<string>()
  const RIGHE = 500

  for (const tabella of ['tesseramenti_annuali', 'certificati_medici_storico']) {
    for (let da = 0; ; da += RIGHE) {
      // Ordinate per chiave primaria, che e' unica. Senza ORDER BY, Postgres non
      // garantisce lo stesso ordine fra due query con OFFSET diversi: una riga
      // potrebbe non comparire in nessuna delle pagine, il certificato che
      // nomina sembrerebbe un orfano e verrebbe cancellato per sempre. Qui non
      // e' una finezza teorica — dall'altra parte c'e' la distruzione
      // irreversibile di un documento sanitario di un socio in regola.
      const { data, error } = await supabase
        .from(tabella)
        .select('id, url_certificato_pdf')
        .not('url_certificato_pdf', 'is', null)
        .order('id')
        .range(da, da + RIGHE - 1)

      if (error) return { percorsi: [], errore: `${tabella}: ${error.message}` }
      if (!data || data.length === 0) break

      for (const r of data) {
        if (r.url_certificato_pdf) nominati.add(r.url_certificato_pdf as string)
      }

      if (data.length < RIGHE) break
    }
  }

  // Solo `iscrizioni/`, che e' la cartella dove finisce il caricamento fatto
  // prima della firma. Quelli sotto l'id dell'utente li scrive l'area
  // personale, che rimuove da se' il file se la riga non riesce a scriversi.
  const limite = new Date(adesso.getTime() - GIORNI_PRIMA_DI_BUTTARE_UN_ORFANO * 86400_000)
  const orfani: string[] = []
  const PAGINA = 100

  for (let scarto = 0; ; scarto += PAGINA) {
    const { data, error } = await supabase.storage
      .from(ARCHIVIO)
      .list('iscrizioni', { limit: PAGINA, offset: scarto })

    if (error) return { percorsi: [], errore: error.message }
    if (!data || data.length === 0) break

    for (const oggetto of data) {
      // `list` restituisce anche le cartelle, che non hanno id.
      if (!oggetto.id) continue
      const percorso = `iscrizioni/${oggetto.name}`
      if (nominati.has(percorso)) continue
      const creato = oggetto.created_at ? new Date(oggetto.created_at) : null
      if (!creato || Number.isNaN(creato.getTime())) continue
      if (creato < limite) orfani.push(percorso)
    }

    if (data.length < PAGINA) break
  }

  return { percorsi: orfani, errore: null }
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Prova senza cancellare: serve per il primo giro e ogni volta che si cambia
  // la regola. Una cancellazione di documenti sanitari non si collauda addosso
  // ai dati veri sperando che vada bene.
  const parametri = new URL(req.url).searchParams
  let simulazione = parametri.get('simulazione') === '1'
  try {
    const corpo = await req.json()
    if (corpo?.simulazione === true) simulazione = true
  } catch { /* corpo assente o non JSON: va bene */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const oggi = new Date()

  const { data: storico, error: errStorico } = await supabase
    .from('certificati_medici_storico')
    .select('id, anno_sportivo, url_certificato_pdf')
    .not('url_certificato_pdf', 'is', null)
    .is('cancellato_il', null)

  const { data: tesseramenti, error: errTess } = await supabase
    .from('tesseramenti_annuali')
    .select('id, anno_sportivo, url_certificato_pdf')
    .not('url_certificato_pdf', 'is', null)

  if (errStorico || errTess) {
    return new Response(
      JSON.stringify({ error: errStorico?.message ?? errTess?.message }),
      { status: 500 }
    )
  }

  const storicoScaduto: Riga[] = []
  const tesseramentiScaduti: Riga[] = []
  const daConservare = new Set<string>()
  const nonDatabili: { tabella: string; id: string; anno_sportivo: string | null }[] = []

  for (const [tabella, righe, scaduti] of [
    ['certificati_medici_storico', storico ?? [], storicoScaduto],
    ['tesseramenti_annuali', tesseramenti ?? [], tesseramentiScaduti],
  ] as [string, Riga[], Riga[]][]) {
    for (const riga of righe) {
      const esito = terminePassato(riga.anno_sportivo, oggi)
      if (esito === null) {
        // Non si cancella ciò che non si sa datare: si segnala e si lascia
        // stare. Un anno sportivo illeggibile è un difetto da correggere a
        // mano, non un motivo per distruggere un documento.
        nonDatabili.push({ tabella, id: riga.id, anno_sportivo: riga.anno_sportivo })
        if (riga.url_certificato_pdf) daConservare.add(riga.url_certificato_pdf)
      } else if (esito) {
        scaduti.push(riga)
      } else if (riga.url_certificato_pdf) {
        daConservare.add(riga.url_certificato_pdf)
      }
    }
  }

  // Un file può essere richiamato da più righe: quella del tesseramento e
  // quella di storico della stessa stagione puntano allo stesso PDF. Si
  // cancella solo se NESSUNA riga ancora nei termini lo richiama.
  const candidati = new Set<string>()
  for (const r of [...storicoScaduto, ...tesseramentiScaduti]) {
    if (r.url_certificato_pdf) candidati.add(r.url_certificato_pdf)
  }
  const daCancellare = [...candidati].filter((p) => !daConservare.has(p))
  const trattenuti = [...candidati].filter((p) => daConservare.has(p))

  // Seconda passata: i file che nessuna riga nomina. Non hanno una stagione da
  // cui contare il termine — non hanno niente — quindi si datano da soli, dal
  // momento in cui sono stati caricati.
  const { percorsi: orfani, errore: erroreOrfani } = await orfaniDaButtare(supabase, oggi)

  if (simulazione) {
    return new Response(JSON.stringify({
      simulazione: true,
      oggi: oggi.toISOString().slice(0, 10),
      daCancellare,
      trattenutiPerchePuntatiDaRigheNeiTermini: trattenuti,
      righeStoricoInteressate: storicoScaduto.length,
      righeTesseramentoInteressate: tesseramentiScaduti.length,
      nonDatabili,
      orfaniOltre: `${GIORNI_PRIMA_DI_BUTTARE_UN_ORFANO} giorni`,
      orfaniDaCancellare: orfani,
      erroreRicercaOrfani: erroreOrfani,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  // Cancellazione dei file tramite l'API di Storage: una DELETE su
  // storage.objects toglierebbe i metadati lasciando il file nel bucket.
  const errori: { percorso: string; messaggio: string }[] = []
  const cancellati = new Set<string>()

  // Gli orfani si cancellano insieme agli scaduti: stesso archivio, stessa API.
  // Non entrano invece negli aggiornamenti di riga qui sotto, perche' righe che
  // li nominino non ce ne sono — e' esattamente questo che li rende orfani.
  if (erroreOrfani) errori.push({ percorso: 'ricerca orfani', messaggio: erroreOrfani })
  const tuttiDaCancellare = [...daCancellare, ...orfani]

  for (let i = 0; i < tuttiDaCancellare.length; i += 100) {
    const gruppo = tuttiDaCancellare.slice(i, i + 100)
    const { error } = await supabase.storage.from(ARCHIVIO).remove(gruppo)
    if (error) {
      for (const p of gruppo) errori.push({ percorso: p, messaggio: error.message })
    } else {
      for (const p of gruppo) cancellati.add(p)
    }
  }

  // Solo le righe il cui file è stato davvero rimosso perdono il riferimento
  // e ricevono la data di cancellazione: marcare una riga il cui file e'
  // ancora nell'archivio scriverebbe a registro una cosa falsa.
  const adesso = new Date().toISOString()

  const idStorico = storicoScaduto
    .filter((r) => r.url_certificato_pdf && cancellati.has(r.url_certificato_pdf))
    .map((r) => r.id)

  const idTesseramenti = tesseramentiScaduti
    .filter((r) => r.url_certificato_pdf && cancellati.has(r.url_certificato_pdf))
    .map((r) => r.id)

  // I conteggi si alzano solo a scrittura riuscita: dichiarare righe
  // aggiornate insieme all'errore che ne ha impedito l'aggiornamento è il
  // modo migliore per non accorgersi di un guasto.
  let righeStoricoAggiornate = 0
  let righeTesseramentoAggiornate = 0

  if (idStorico.length > 0) {
    const { error } = await supabase
      .from('certificati_medici_storico')
      .update({ url_certificato_pdf: null, cancellato_il: adesso })
      .in('id', idStorico)
    if (error) errori.push({ percorso: 'aggiornamento storico', messaggio: error.message })
    else righeStoricoAggiornate = idStorico.length
  }

  if (idTesseramenti.length > 0) {
    const { error } = await supabase
      .from('tesseramenti_annuali')
      .update({ url_certificato_pdf: null })
      .in('id', idTesseramenti)
    if (error) errori.push({ percorso: 'aggiornamento tesseramenti', messaggio: error.message })
    else righeTesseramentoAggiornate = idTesseramenti.length
  }

  return new Response(JSON.stringify({
    oggi: oggi.toISOString().slice(0, 10),
    fileCancellati: cancellati.size,
    diCuiOrfaniMaiCollegati: orfani.filter((p) => cancellati.has(p)).length,
    righeStoricoAggiornate,
    righeTesseramentoAggiornate,
    trattenutiPerchePuntatiDaRigheNeiTermini: trattenuti.length,
    nonDatabili,
    errori,
  }), { headers: { 'Content-Type': 'application/json' } })
})
