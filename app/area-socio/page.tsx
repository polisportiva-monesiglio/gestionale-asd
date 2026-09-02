import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import AreaSocioTabs from './AreaSocioTabs'
import RinnovoTesseramento, { type SocioDaRinnovare } from './RinnovoTesseramento'
import { certificatoAncoraValido } from '@/lib/rinnovoServer'
import { partiRomane } from '@/lib/dataRoma'

export default async function AreaSocioPage({
  searchParams,
}: {
  searchParams: Promise<{ [chiave: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Piu' d'uno quando un genitore ha iscritto piu' figli con la propria email.
  // Non e' un cambio di identita': sono le persone che quell'account segue.
  const { data: soci } = await supabase
    .from('soci')
    .select(
      'id, nome, cognome, cf, data_nascita, luogo_nascita, indirizzo, cap, citta, ' +
      'provincia_residenza, telefono, email, minorenne, genitore_nome, genitore_cognome, ' +
      'genitore_email, genitore_contatto_preferito, genitore_recapito'
    )
    .eq('user_id', user.id)
    .order('nome')

  // L'elenco delle colonne e' una stringa composta: i tipi generati da Supabase
  // non sanno che forma abbia la riga, la si dichiara qui una volta sola.
  const elenco = (soci ?? []) as unknown as SocioDaRinnovare[]

  // La persona scelta arriva dall'indirizzo, cosi' il collegamento e' condivisibile
  // e la pagina resta un componente di server. L'identificativo va comunque
  // confrontato con l'elenco: se non e' fra i suoi, si torna al primo.
  const richiesto = (await searchParams).socio
  const idRichiesto = Array.isArray(richiesto) ? richiesto[0] : richiesto
  const socio: SocioDaRinnovare | null = elenco.find(s => s.id === idRichiesto) ?? elenco[0] ?? null

  const annoSportivo = getAnnoSportivo()

  const [
    { data: tesseramento },
    { data: abbonamenti },
    { data: attivita },
    { data: storicoCertificati },
    { data: codiceCassetta },
  ] = await Promise.all([
    supabase
      .from('tesseramenti_annuali')
      .select('id, data_scadenza_certificato, url_certificato_pdf, url_modulo_firmato_pdf')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .maybeSingle(),
    supabase
      .from('abbonamenti_soci')
      .select('id, stato_pagamento, importo_tesseramento_uisp, note_socio, data_acquisto, inizio_scelto, data_inizio_validita, data_fine_validita, motivo_rifiuto, catalogo_attivita(nome_attivita, prezzo_base), pagamenti_ricevute(id, numero_ricevuta)')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .order('data_acquisto', { ascending: false }),
    supabase
      .from('catalogo_attivita')
      .select('id, nome_attivita, tipo, prezzo_base, durata_mesi')
      .eq('attivo', true)
      .order('nome_attivita'),
    supabase
      .from('certificati_medici_storico')
      .select('id, url_certificato_pdf, data_scadenza_certificato, caricato_il')
      .eq('socio_id', socio?.id ?? '')
      .order('caricato_il', { ascending: false }),
    // Le RLS lasciano leggere questa riga solo a chi ha un abbonamento pagato
    // nella stagione corrente: per gli altri torna semplicemente null.
    supabase
      .from('impostazioni')
      .select('valore, aggiornato_il')
      .eq('chiave', 'codice_cassetta')
      .maybeSingle(),
  ])

  // URL firmato per il certificato corrente (valido 1h)
  let certificatoUrl: string | null = null
  if (tesseramento?.url_certificato_pdf) {
    const { data } = await supabase.storage
      .from('certificati-medici')
      .createSignedUrl(tesseramento.url_certificato_pdf, 3600)
    certificatoUrl = data?.signedUrl ?? null
  }

  // Modulo di iscrizione firmato: il socio deve poterne riavere copia in ogni
  // momento, non solo nell'istante in cui lo sottoscrive.
  let moduloFirmatoUrl: string | null = null
  if (tesseramento?.url_modulo_firmato_pdf) {
    const { data } = await supabase.storage
      .from('moduli-firmati')
      .createSignedUrl(tesseramento.url_modulo_firmato_pdf, 3600, {
        download: `Modulo_iscrizione_${annoSportivo.replace('/', '-')}.pdf`,
      })
    moduloFirmatoUrl = data?.signedUrl ?? null
  }

  // URL firmati per lo storico caricamenti (esclude quello già mostrato come "corrente")
  const storicoCertificatiConUrl = await Promise.all(
    (storicoCertificati ?? [])
      .filter(c => c.url_certificato_pdf !== tesseramento?.url_certificato_pdf)
      .map(async c => {
        const { data } = await supabase.storage
          .from('certificati-medici')
          .createSignedUrl(c.url_certificato_pdf, 3600)
        return {
          id: c.id,
          dataScadenza: c.data_scadenza_certificato,
          caricatoIl: c.caricato_il,
          url: data?.signedUrl ?? null,
        }
      })
  )

  // Appiattisce il join catalogo_attivita per passare dati serializzabili al client
  type RawAb = {
    id: string
    stato_pagamento: string
    importo_tesseramento_uisp: number | null
    note_socio: string | null
    data_acquisto: string | null
    inizio_scelto: string | null
    data_inizio_validita: string | null
    data_fine_validita: string | null
    motivo_rifiuto: string | null
    catalogo_attivita: { nome_attivita: string; prezzo_base: number | null }[] | { nome_attivita: string; prezzo_base: number | null } | null
    pagamenti_ricevute: { id: string; numero_ricevuta: string | null }[] | null
  }

  const abbonamentiFlattenati = ((abbonamenti ?? []) as unknown as RawAb[]).map(ab => {
    const act = Array.isArray(ab.catalogo_attivita)
      ? ab.catalogo_attivita[0] ?? null
      : ab.catalogo_attivita
    const ricevuta = ab.pagamenti_ricevute?.[0] ?? null
    return {
      id: ab.id,
      stato_pagamento: ab.stato_pagamento,
      importo_tesseramento_uisp: ab.importo_tesseramento_uisp,
      note_socio: ab.note_socio,
      data_acquisto: ab.data_acquisto,
      inizio_scelto: ab.inizio_scelto,
      data_inizio_validita: ab.data_inizio_validita,
      data_fine_validita: ab.data_fine_validita,
      motivo_rifiuto: ab.motivo_rifiuto,
      nome_attivita: act?.nome_attivita ?? null,
      prezzo_base: act?.prezzo_base ?? null,
      ricevutaId: ricevuta?.id ?? null,
      numeroRicevuta: ricevuta?.numero_ricevuta ?? null,
    }
  })

  // Senza il tesseramento della stagione in corso non si e' soci per quest'anno:
  // e' il rinnovo, non una seconda iscrizione. L'anagrafica resta quella, si
  // rifanno le dichiarazioni dell'anno e si rifirma.
  const deveRinnovare = socio !== null && !tesseramento
  const oggiRoma = (() => {
    const { anno, mese, giorno } = partiRomane(new Date())
    return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
  })()
  const certificatoRiusabile =
    deveRinnovare && socio ? await certificatoAncoraValido(socio.id, oggiRoma) : null

  const hasPending = abbonamentiFlattenati.some(a => a.stato_pagamento === 'da_saldare')
  const haAbbonamentoPagato = abbonamentiFlattenati.some(a => a.stato_pagamento === 'pagato')
  const uispApplicabile = !haAbbonamentoPagato

  return (
    <>

      <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 font-sans text-gray-800">
        <div className="max-w-xl mx-auto space-y-5">

          {/* Header */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src="/logo-asd-monesiglio.png"
                  alt="Logo ASD Polisportiva Monesiglio"
                  className="w-11 h-11 object-contain"
                />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                    ASD Polisportiva Monesiglio
                  </p>
                  <h1 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">
                    Ciao, {socio?.nome ?? user.email}!
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Area personale · Stagione {annoSportivo}
                  </p>
                </div>
              </div>
              <form action="/auth/logout" method="post">
                <button className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                  Esci
                </button>
              </form>
            </div>
          </div>

          {/* Le persone seguite da questo accesso. Con una sola non compare
              nulla: chi ha un solo tesserato non deve accorgersi di niente. */}
          {elenco.length > 1 && (
            <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 pl-1">
                Persone che segui
              </p>
              <div className="flex flex-wrap gap-2">
                {elenco.map(p => {
                  const attiva = p.id === socio?.id
                  return (
                    <a
                      key={p.id}
                      href={`/area-socio?socio=${p.id}`}
                      aria-current={attiva ? 'page' : undefined}
                      className={
                        attiva
                          ? 'rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-gray-900'
                          : 'rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors'
                      }
                    >
                      {p.nome} {p.cognome}
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Rinnovo: sta sopra a tutto, perche' finche' non e' fatto il resto
              dell'area non ha molto senso. */}
          {deveRinnovare && socio && (
            <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-yellow-300 border-t-[6px] border-t-yellow-400 p-6 sm:p-8">
              <div className="flex items-center mb-1">
                <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
                <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
                  Rinnova il tesseramento {annoSportivo}
                </h2>
              </div>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed pl-4">
                I tuoi dati sono già qui: controllali, rifai le dichiarazioni dell&apos;anno e
                firma. Non devi ricompilare niente da capo.
              </p>
              <RinnovoTesseramento
                socio={socio}
                annoSportivo={annoSportivo}
                certificatoValidoFinoAl={certificatoRiusabile?.scadenza ?? null}
              />
            </div>
          )}

          {/* Contenuto con tab */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-yellow-400 p-6 sm:p-8">
            <AreaSocioTabs
              socioId={socio?.id ?? ''}
              tesseramento={tesseramento ?? null}
              certificatoUrl={certificatoUrl}
              storicoCertificati={storicoCertificatiConUrl}
              abbonamenti={abbonamentiFlattenati}
              attivita={attivita ?? []}
              hasPending={hasPending}
              uispApplicabile={uispApplicabile}
              annoSportivo={annoSportivo}
            />
          </div>

          {/* Modulo di iscrizione firmato */}
          {moduloFirmatoUrl && (
            <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-6 sm:p-8">
              <div className="flex items-center mb-1">
                <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
                <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
                  Il tuo modulo di iscrizione
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5 pl-4">
                Il documento che hai firmato al momento dell&apos;iscrizione, con i dati dichiarati
                e gli estremi della firma elettronica.
              </p>
              <a
                href={moduloFirmatoUrl}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                ↓ Scarica il modulo firmato
              </a>
            </div>
          )}

          {/* Codice della cassetta.
              La condizione non si ripete qui: se `codiceCassetta` e' arrivato,
              vuol dire che le RLS hanno gia' stabilito che questo socio ne ha
              diritto — abbonamento pagato e periodo in corso. Ripetere la
              regola a schermo l'aveva gia' fatta divergere: la lettura qui
              sopra filtra sulla stagione corrente, e fra il 15 e il 31 agosto
              un abbonamento ancora valido e' della stagione precedente, quindi
              la scheda spariva anche a chi il codice poteva vederlo. */}
          {codiceCassetta?.valore && (
            <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-6 sm:p-8">
              <div className="flex items-center mb-1">
                <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
                <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
                  Cassetta delle chiavi
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-5 pl-4">
                La combinazione per accedere alla palestra. Cambia periodicamente:
                controlla qui il valore aggiornato.
              </p>

              <div className="rounded-2xl bg-gray-900 px-6 py-7 text-center">
                <p className="text-3xl sm:text-4xl font-extrabold text-yellow-400 tracking-[0.3em] font-mono">
                  {codiceCassetta.valore}
                </p>
              </div>

              {codiceCassetta.aggiornato_il && (
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Aggiornato il{' '}
                  {new Date(codiceCassetta.aggiornato_il).toLocaleDateString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                  })}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-4 leading-relaxed border-t border-gray-100 pt-4">
                Il codice è riservato ai soci: non condividerlo con chi non è iscritto.
              </p>
            </div>
          )}

        </div>
      </main>
    </>
  )
}
