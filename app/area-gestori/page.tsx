import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { AzioniRichiesta } from './AzioniRichiesta'
import { etichettaInizio, formattaGiorno } from '@/lib/abbonamento'
import { MenuDrawer } from './MenuDrawer'
import { etichettaMetodo } from '@/lib/pagamenti'
import { contaPer, andamentoIscrizioni, giorniAllaScadenza } from '@/lib/analisi'
import { ContattiRichiesta } from './ContattiRichiesta'
import type { DatiSocio } from '@/lib/contattiSocio'
import { SchedaGrafico, BarreOrizzontali, Colonne, Riquadro } from './Grafici'

function formatData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function badgeScadenza(scadenza: string | null) {
  if (!scadenza) return { label: 'Mancante', cls: 'bg-gray-100 text-gray-500' }
  const days = Math.ceil((new Date(scadenza).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Scaduto', cls: 'bg-red-100 text-red-600' }
  if (days <= 14) return { label: `Scade in ${days}g`, cls: 'bg-red-100 text-red-600' }
  if (days <= 30) return { label: `Scade in ${days}g`, cls: 'bg-yellow-100 text-yellow-700' }
  return { label: `Valido (${days}g)`, cls: 'bg-green-100 text-green-700' }
}

export default async function AreaGestoriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: gestore } = await supabase
    .from('gestori')
    .select('nome, is_admin')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) redirect('/auth/non-autorizzato')

  const annoSportivo = getAnnoSportivo()
  const oggi = new Date()
  const tra30Giorni = new Date(oggi.getTime() + 30 * 86400000).toISOString().slice(0, 10)

  const [
    { data: richiesteRaw },
    { data: certInScadenzaRaw },
    { data: impostazione },
    { data: tesseramentiRaw },
    { data: abbonamentiRaw },
  ] = await Promise.all([
    supabase
      .from('abbonamenti_soci')
      .select(`
        id, importo_tesseramento_uisp, metodo_pagamento, data_acquisto, note_socio,
        inizio_scelto, data_inizio_validita, data_fine_validita,
        catalogo_attivita(nome_attivita, prezzo_base),
        soci(nome, cognome, email, telefono, minorenne, genitore_nome, genitore_cognome, genitore_email, genitore_recapito)
      `)
      .eq('stato_pagamento', 'da_saldare')
      .eq('anno_sportivo', annoSportivo)
      .order('data_acquisto', { ascending: true }),
    supabase
      .from('tesseramenti_annuali')
      .select(`id, data_scadenza_certificato, soci(nome, cognome, email)`)
      .eq('anno_sportivo', annoSportivo)
      .lte('data_scadenza_certificato', tra30Giorni)
      .order('data_scadenza_certificato', { ascending: true }),
    supabase
      .from('impostazioni')
      .select('valore')
      .eq('chiave', 'codice_cassetta')
      .maybeSingle(),
    // Per i grafici. `timestamp_firma` e non `soci.data_registrazione`: la
    // seconda dice quando una persona si e' iscritta la prima volta in
    // assoluto, e a stagione nuova un socio che rinnova non comparirebbe mai
    // piu' nell'andamento.
    supabase
      .from('tesseramenti_annuali')
      .select('id, timestamp_firma')
      .eq('anno_sportivo', annoSportivo),
    supabase
      .from('abbonamenti_soci')
      .select(`
        id, stato_pagamento, metodo_pagamento, data_fine_validita,
        catalogo_attivita(nome_attivita),
        soci(nome, cognome)
      `)
      .eq('anno_sportivo', annoSportivo),
  ])

  type RawRichiesta = {
    id: string
    importo_tesseramento_uisp: number | null
    metodo_pagamento: string | null
    data_acquisto: string | null
    note_socio: string | null
    inizio_scelto: string | null
    data_inizio_validita: string | null
    data_fine_validita: string | null
    catalogo_attivita: { nome_attivita: string; prezzo_base: number | null }[] | { nome_attivita: string; prezzo_base: number | null } | null
    soci: DatiSocio[] | DatiSocio | null
  }

  const richieste = ((richiesteRaw ?? []) as unknown as RawRichiesta[]).map(r => {
    const att = Array.isArray(r.catalogo_attivita) ? r.catalogo_attivita[0] : r.catalogo_attivita
    const s = Array.isArray(r.soci) ? r.soci[0] : r.soci
    const nomeAttivita = att?.nome_attivita ?? '—'
    return {
      id: r.id,
      nomeSocio: s ? `${s.nome} ${s.cognome}` : '—',
      emailSocio: s?.email ?? null,
      // Grezzo: chi contattare lo decide `ContattiRichiesta`, perche' per un
      // minorenne non e' il socio.
      socio: s ?? null,
      nomeAttivita,
      prezzoBase: Number(att?.prezzo_base ?? 0),
      uisp: Number(r.importo_tesseramento_uisp ?? 0),
      metodo: r.metodo_pagamento,
      dataRichiesta: r.data_acquisto,
      note: r.note_socio,
      inizioScelto: r.inizio_scelto,
      dataInizio: r.data_inizio_validita,
      dataFine: r.data_fine_validita,
    }
  })

  /* ---------------- I conti per i grafici ---------------- */

  type RawAbbonamento = {
    id: string
    stato_pagamento: string | null
    metodo_pagamento: string | null
    data_fine_validita: string | null
    catalogo_attivita: { nome_attivita: string }[] | { nome_attivita: string } | null
    soci: { nome: string; cognome: string }[] | { nome: string; cognome: string } | null
  }

  const abbonamenti = ((abbonamentiRaw ?? []) as unknown as RawAbbonamento[]).map(a => {
    const att = Array.isArray(a.catalogo_attivita) ? a.catalogo_attivita[0] : a.catalogo_attivita
    const s = Array.isArray(a.soci) ? a.soci[0] : a.soci
    return {
      id: a.id,
      stato: a.stato_pagamento,
      metodo: a.metodo_pagamento,
      fine: a.data_fine_validita,
      attivita: att?.nome_attivita ?? null,
      socio: s ? `${s.cognome} ${s.nome}` : 'Socio non trovato',
    }
  })

  const pagati = abbonamenti.filter(a => a.stato === 'pagato')

  const andamento = andamentoIscrizioni(
    ((tesseramentiRaw ?? []) as { timestamp_firma: string | null }[]).map(t => t.timestamp_firma)
  )

  // Solo sui pagati: un metodo indicato in una richiesta ancora da confermare
  // e' un'intenzione, non un incasso, e mescolarlo falserebbe il conto.
  const metodi = contaPer(pagati, a => etichettaMetodo(a.metodo))

  // Su tutte le richieste invece, comprese le rifiutate: la domanda e' cosa
  // chiede la gente, e una richiesta rifiutata l'ha chiesta lo stesso.
  const tipiRichiesti = contaPer(abbonamenti, a => a.attivita)

  const GIORNI_DI_PREAVVISO = 30

  // Quelli gia' finiti non sono "in scadenza": sono finiti, e chi li aveva o
  // ha gia' rinnovato o non e' piu' in palestra. Qui interessa chi va
  // richiamato prima che scada.
  const inScadenza = pagati
    .filter(a => a.fine !== null)
    .map(a => ({ ...a, giorni: giorniAllaScadenza(a.fine as string) }))
    .filter(a => a.giorni >= 0 && a.giorni <= GIORNI_DI_PREAVVISO)
    .sort((a, b) => a.giorni - b.giorni)

  const attiviOggi = pagati.filter(a => a.fine !== null && giorniAllaScadenza(a.fine as string) >= 0).length

  type RawCert = {
    id: string
    data_scadenza_certificato: string | null
    soci: { nome: string; cognome: string; email: string | null }[] | { nome: string; cognome: string; email: string | null } | null
  }

  const certInScadenza = ((certInScadenzaRaw ?? []) as unknown as RawCert[]).map(c => {
    const s = Array.isArray(c.soci) ? c.soci[0] : c.soci
    return {
      id: c.id,
      nomeSocio: s ? `${s.nome} ${s.cognome}` : '—',
      emailSocio: s?.email ?? null,
      scadenza: c.data_scadenza_certificato,
    }
  })

  return (
    <>

      <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 font-sans text-gray-800">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Header */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src="/logo-asd-monesiglio.png" alt="Logo" className="w-11 h-11 object-contain" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                    ASD Polisportiva Monesiglio
                  </p>
                  <h1 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">
                    Area Gestori
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {gestore.nome ?? user.email} · Stagione {annoSportivo}
                  </p>
                </div>
              </div>
              <MenuDrawer codiceAttuale={impostazione?.valore ?? null} isAdmin={!!gestore.is_admin} />
            </div>
          </div>

          {/* ---------------- Dashboard ----------------
              In cima i numeri della stagione, poi le richieste da decidere a
              tutta larghezza, e in fondo le scadenze chiuse in due righe da
              aprire. Ordine scelto da Luca il 18 settembre 2026: prima era il
              contrario, con i grafici in fondo. */}
          <div className="pt-2">
            <h2 className="text-base font-bold text-gray-900 px-1">Dashboard</h2>
            <p className="text-xs text-gray-400 px-1 mt-0.5">
              Stagione {annoSportivo}. I conti si aggiornano da soli a ogni apertura.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Riquadro
              etichetta="Tesserati"
              valore={(tesseramentiRaw ?? []).length}
              nota={`Moduli firmati per la stagione ${annoSportivo}`}
            />
            <Riquadro
              etichetta="Frequenze attive"
              valore={attiviOggi}
              nota="Periodi pagati e non ancora finiti"
            />
            <Riquadro
              etichetta="In scadenza"
              valore={inScadenza.length}
              nota={`Periodi che finiscono entro ${GIORNI_DI_PREAVVISO} giorni`}
              tono={inScadenza.length > 0 ? 'attenzione' : 'neutro'}
            />
            <Riquadro
              etichetta="Da confermare"
              valore={richieste.length}
              nota="Richieste in attesa di una decisione"
              tono={richieste.length > 0 ? 'attenzione' : 'neutro'}
            />
          </div>

          <SchedaGrafico
            titolo="Andamento delle iscrizioni"
            sottotitolo={
              andamento.totale === 0
                ? 'Nessun modulo firmato per ora.'
                : `${andamento.totale} ${andamento.totale === 1 ? 'modulo firmato' : 'moduli firmati'}, ` +
                  `contati per ${andamento.passo}`
            }
          >
            <Colonne punti={andamento.punti} />
          </SchedaGrafico>

          <div className="grid md:grid-cols-2 gap-5">
            <SchedaGrafico
              titolo="Come hanno pagato"
              sottotitolo="Solo i periodi gia' incassati"
            >
              <BarreOrizzontali dati={metodi} vuoto="Nessun pagamento incassato per ora." />
            </SchedaGrafico>

            <SchedaGrafico
              titolo="Periodi richiesti"
              sottotitolo="Tutte le richieste, comprese quelle rifiutate"
            >
              <BarreOrizzontali dati={tipiRichiesti} vuoto="Nessuna richiesta per ora." />
            </SchedaGrafico>
          </div>

          {/* ---------------- Richieste di pagamento ----------------
              A tutta larghezza e col bordo acceso quando c'e' qualcosa da
              decidere: e' l'unico riquadro che chiede di fare qualcosa. */}
          <section
            id="richieste"
            className={`bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-t-[6px] border-t-blue-600 p-6 sm:p-8 ${
              richieste.length > 0 ? 'border-blue-300 ring-4 ring-blue-50' : 'border-gray-100'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">Richieste di pagamento</h2>
                <p className="text-xs text-gray-400 mt-0.5">Da confermare o rifiutare, dalla più vecchia.</p>
              </div>
              <span
                className={`px-3 py-1 text-sm font-bold rounded-full ${
                  richieste.length > 0 ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {richieste.length} in attesa
              </span>
            </div>

            {richieste.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessuna richiesta in attesa.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4 items-start">
                {richieste.map(r => (
                  <div key={r.id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900">{r.nomeSocio}</p>
                        {r.emailSocio && <p className="text-xs text-gray-400 break-all">{r.emailSocio}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold text-blue-700">
                          € {(r.prezzoBase + r.uisp).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-gray-400">{etichettaMetodo(r.metodo)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-600">
                        {r.nomeAttivita}
                      </span>
                      {r.uisp > 0 && (
                        <span className="px-2 py-0.5 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                          +€{r.uisp} tesseramento
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                        {formatData(r.dataRichiesta)}
                      </span>
                    </div>

                    {r.dataInizio ? (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
                          Decorrenza scelta dal socio
                        </p>
                        <p className="text-sm font-bold text-blue-900 mt-0.5">
                          {etichettaInizio(r.inizioScelto)} — dal {formattaGiorno(r.dataInizio)} al{' '}
                          {formattaGiorno(r.dataFine)}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <p className="text-xs text-gray-500">
                          Richiesta inviata prima che la decorrenza fosse una scelta: non ha un
                          periodo di validità.
                        </p>
                      </div>
                    )}

                    {r.note && (
                      <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                        {r.note}
                      </p>
                    )}

                    {/* Per chiedere un chiarimento prima di decidere. */}
                    <ContattiRichiesta socio={r.socio} attivita={r.nomeAttivita} />

                    <AzioniRichiesta abbonamentoId={r.id} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------------- Scadenze ----------------
              Chiuse, con il solo conteggio in vista: si aprono quando serve.
              `<details>` e non un bottone con stato: funziona senza
              JavaScript, e la tastiera e i lettori di schermo lo capiscono da
              soli. */}
          <div className="pt-2">
            <h2 className="text-base font-bold text-gray-900 px-1">Scadenze</h2>
            <p className="text-xs text-gray-400 px-1 mt-0.5">
              Entro {GIORNI_DI_PREAVVISO} giorni. Tocca una riga per vedere chi.
            </p>
          </div>

          <details className="group bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-l-[6px] border-l-amber-400">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-bold text-gray-900">
                {inScadenza.length === 0
                  ? `Nessuna frequenza in scadenza nei prossimi ${GIORNI_DI_PREAVVISO} giorni`
                  : inScadenza.length === 1
                    ? "C'è 1 frequenza in scadenza"
                    : `Ci sono ${inScadenza.length} frequenze in scadenza`}
              </span>
              <span className="text-gray-400 text-xs transition-transform group-open:rotate-180" aria-hidden="true">
                ▼
              </span>
            </summary>
            <div className="px-6 pb-5">
              {inScadenza.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Niente da richiamare per ora.</p>
              ) : (
                <ul className="space-y-2">
                  {inScadenza.map(a => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{a.socio}</p>
                        <p className="text-xs text-gray-400 truncate">{a.attivita ?? '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            a.giorni <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {a.giorni === 0 ? 'Scade oggi' : a.giorni === 1 ? 'Fra 1 giorno' : `Fra ${a.giorni} giorni`}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatData(a.fine)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details className="group bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-l-[6px] border-l-orange-400">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-bold text-gray-900">
                {certInScadenza.length === 0
                  ? `Nessun certificato scaduto o in scadenza entro ${GIORNI_DI_PREAVVISO} giorni`
                  : certInScadenza.length === 1
                    ? "C'è 1 certificato scaduto o in scadenza"
                    : `Ci sono ${certInScadenza.length} certificati scaduti o in scadenza`}
              </span>
              <span className="text-gray-400 text-xs transition-transform group-open:rotate-180" aria-hidden="true">
                ▼
              </span>
            </summary>
            <div className="px-6 pb-5">
              {certInScadenza.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Tutti i certificati sono validi oltre i {GIORNI_DI_PREAVVISO} giorni.</p>
              ) : (
                <ul className="space-y-2">
                  {certInScadenza.map(c => {
                    const badge = badgeScadenza(c.scadenza)
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 bg-gray-50">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.nomeSocio}</p>
                          {c.emailSocio && <p className="text-xs text-gray-400 truncate">{c.emailSocio}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatData(c.scadenza)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </details>

        </div>
      </main>
    </>
  )
}
