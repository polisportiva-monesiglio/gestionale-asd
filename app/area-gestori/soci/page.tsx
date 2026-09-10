import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { SociList } from './SociList'
import { StagioneSelect } from './StagioneSelect'
import { leggiDecisioni, type Decisione } from '@/lib/storicoDecisioni'

const GIORNI_NUOVO_ISCRITTO = 7

function calcolaSogliaNuovoIscritto(giorni: number): number {
  return Date.now() - giorni * 24 * 60 * 60 * 1000
}

export default async function ListaSociPage({
  searchParams,
}: {
  searchParams: Promise<{ stagione?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: gestore } = await supabase
    .from('gestori')
    .select('nome')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) redirect('/auth/non-autorizzato')

  const annoCorrente = getAnnoSportivo()
  const { stagione: stagioneParam } = await searchParams
  const stagioneSelezionata = stagioneParam || annoCorrente
  const sogliaNuovoIscritto = calcolaSogliaNuovoIscritto(GIORNI_NUOVO_ISCRITTO)

  const [{ data: tessStagioni }, { data: abbStagioni }] = await Promise.all([
    supabase.from('tesseramenti_annuali').select('anno_sportivo'),
    supabase.from('abbonamenti_soci').select('anno_sportivo'),
  ])

  const stagioniDisponibili = Array.from(
    new Set([
      annoCorrente,
      ...(tessStagioni ?? []).map(t => t.anno_sportivo),
      ...(abbStagioni ?? []).map(a => a.anno_sportivo).filter((s): s is string => !!s),
    ])
  ).sort((a, b) => b.localeCompare(a))

  const { data: sociRaw } = await supabase
    .from('soci')
    .select(`
      id, nome, cognome, email, telefono, data_registrazione,
      luogo_nascita, provincia_nascita, data_nascita, cf,
      indirizzo, cap, citta, provincia_residenza, minorenne,
      tesseramenti_annuali(id, anno_sportivo, data_scadenza_certificato, url_modulo_firmato_pdf, url_certificato_pdf),
      abbonamenti_soci(anno_sportivo, stato_pagamento, data_acquisto, catalogo_attivita(nome_attivita))
    `)
    .order('cognome')

  type RawSocio = {
    id: string
    nome: string
    cognome: string
    email: string | null
    telefono: string | null
    data_registrazione: string | null
    luogo_nascita: string | null
    provincia_nascita: string | null
    data_nascita: string | null
    cf: string | null
    indirizzo: string | null
    cap: string | null
    citta: string | null
    provincia_residenza: string | null
    minorenne: boolean | null
    tesseramenti_annuali: { id: string; anno_sportivo: string; data_scadenza_certificato: string | null; url_modulo_firmato_pdf: string | null; url_certificato_pdf: string | null }[] | null
    abbonamenti_soci: {
      anno_sportivo: string | null
      stato_pagamento: string | null
      data_acquisto: string | null
      catalogo_attivita: { nome_attivita: string }[] | { nome_attivita: string } | null
    }[] | null
  }

  const sociConStagione = ((sociRaw ?? []) as unknown as RawSocio[])
    .map(s => {
      const tess = (s.tesseramenti_annuali ?? []).find(t => t.anno_sportivo === stagioneSelezionata) ?? null
      const absCorrenti = (s.abbonamenti_soci ?? []).filter(a => a.anno_sportivo === stagioneSelezionata)
      const abPagato = absCorrenti.find(a => a.stato_pagamento === 'pagato')
      const abPending = absCorrenti.find(a => a.stato_pagamento === 'da_saldare')
      const abCorrente = abPagato ?? abPending ?? null
      const attivita = abCorrente?.catalogo_attivita
      const nomeAtt = Array.isArray(attivita) ? attivita[0]?.nome_attivita : (attivita as { nome_attivita: string } | null)?.nome_attivita

      const nuovoIscritto = !!s.data_registrazione && new Date(s.data_registrazione).getTime() >= sogliaNuovoIscritto

      return {
        id: s.id,
        nome: s.nome,
        cognome: s.cognome,
        email: s.email,
        telefono: s.telefono,
        dataRegistrazione: s.data_registrazione,
        scadenzaCert: tess?.data_scadenza_certificato ?? null,
        statoAbbonamento: abCorrente?.stato_pagamento ?? null,
        nomeAttivita: nomeAtt ?? null,
        tesseramentoId: tess?.id ?? null,
        haModulo: !!tess?.url_modulo_firmato_pdf,
        haCertificato: !!tess?.url_certificato_pdf,
        nuovoIscritto,
        presenteStagione: !!tess || !!abCorrente,
        // I campi che il gestore puo' correggere, tenuti a parte dal resto:
        // la tabella ne mostra alcuni, il modulo di correzione ne tocca altri,
        // e mescolarli renderebbe difficile capire quali finiscono dove.
        daCorreggere: {
          id: s.id,
          nome: s.nome,
          cognome: s.cognome,
          email: s.email,
          telefono: s.telefono,
          luogo_nascita: s.luogo_nascita,
          provincia_nascita: s.provincia_nascita,
          data_nascita: s.data_nascita,
          cf: s.cf,
          indirizzo: s.indirizzo,
          cap: s.cap,
          citta: s.citta,
          provincia_residenza: s.provincia_residenza,
          minorenne: s.minorenne,
          haModuloFirmato: !!tess?.url_modulo_firmato_pdf,
        },
      }
    })
    .filter(s => s.presenteStagione)

  const soci = sociConStagione.map(({ presenteStagione, ...rest }) => rest)

  // Lo storico di tutti, raggruppato per socio, in una lettura sola. Senza
  // filtro di stagione: la lista mostra i soci della stagione scelta, ma
  // aprendo una persona si vuole vedere la sua storia intera.
  const { decisioni } = await leggiDecisioni(supabase)
  const decisioniPerSocio = decisioni.reduce<Record<string, Decisione[]>>((acc, d) => {
    if (!d.socioId) return acc
    ;(acc[d.socioId] ??= []).push(d)
    return acc
  }, {})

  return (
    <>

      <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 font-sans text-gray-800">
        <div className="max-w-3xl mx-auto space-y-5">

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
                    Lista Soci
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">{soci.length} iscritti</p>
                </div>
              </div>
              <Link
                href="/area-gestori"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors px-3 py-1.5 border border-blue-200 rounded-xl"
              >
                ← Dashboard
              </Link>
            </div>
          </div>

          <StagioneSelect stagioni={stagioniDisponibili} selezionata={stagioneSelezionata} />

          <SociList soci={soci} decisioniPerSocio={decisioniPerSocio} />

        </div>
      </main>
    </>
  )
}
