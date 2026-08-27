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

  if (simulazione) {
    return new Response(JSON.stringify({
      simulazione: true,
      oggi: oggi.toISOString().slice(0, 10),
      daCancellare,
      trattenutiPerchePuntatiDaRigheNeiTermini: trattenuti,
      righeStoricoInteressate: storicoScaduto.length,
      righeTesseramentoInteressate: tesseramentiScaduti.length,
      nonDatabili,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  // Cancellazione dei file tramite l'API di Storage: una DELETE su
  // storage.objects toglierebbe i metadati lasciando il file nel bucket.
  const errori: { percorso: string; messaggio: string }[] = []
  const cancellati = new Set<string>()

  for (let i = 0; i < daCancellare.length; i += 100) {
    const gruppo = daCancellare.slice(i, i + 100)
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
    righeStoricoAggiornate,
    righeTesseramentoAggiornate,
    trattenutiPerchePuntatiDaRigheNeiTermini: trattenuti.length,
    nonDatabili,
    errori,
  }), { headers: { 'Content-Type': 'application/json' } })
})
