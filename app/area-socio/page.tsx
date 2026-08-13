import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import AreaSocioTabs from './AreaSocioTabs'

export default async function AreaSocioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: socio } = await supabase
    .from('soci')
    .select('id, nome, cognome, email')
    .eq('user_id', user.id)
    .maybeSingle()

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
      .select('id, data_scadenza_certificato, url_certificato_pdf')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .maybeSingle(),
    supabase
      .from('abbonamenti_soci')
      .select('id, stato_pagamento, importo_tesseramento_uisp, note_socio, data_acquisto, catalogo_attivita(nome_attivita, prezzo_base), pagamenti_ricevute(id, numero_ricevuta)')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .order('data_acquisto', { ascending: false }),
    supabase
      .from('catalogo_attivita')
      .select('id, nome_attivita, tipo, prezzo_base')
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
      nome_attivita: act?.nome_attivita ?? null,
      prezzo_base: act?.prezzo_base ?? null,
      ricevutaId: ricevuta?.id ?? null,
      numeroRicevuta: ricevuta?.numero_ricevuta ?? null,
    }
  })

  const hasPending = abbonamentiFlattenati.some(a => a.stato_pagamento === 'da_saldare')
  const haAbbonamentoPagato = abbonamentiFlattenati.some(a => a.stato_pagamento === 'pagato')
  const uispApplicabile = !haAbbonamentoPagato

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); body { font-family: 'Inter', sans-serif; }` }} />

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

          {/* Contenuto con tab */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-yellow-400 p-6 sm:p-8">
            <AreaSocioTabs
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

          {/* Codice della cassetta: solo per chi ha un abbonamento pagato */}
          {haAbbonamentoPagato && codiceCassetta?.valore && (
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
