import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { SociList } from './SociList'
import { StagioneSelect } from './StagioneSelect'

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
      tesseramenti_annuali(id, anno_sportivo, data_scadenza_certificato, url_modulo_firmato_pdf),
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
    tesseramenti_annuali: { id: string; anno_sportivo: string; data_scadenza_certificato: string | null; url_modulo_firmato_pdf: string | null }[] | null
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
        tesseramentoId: tess && tess.url_modulo_firmato_pdf ? tess.id : null,
        nuovoIscritto,
        presenteStagione: !!tess || !!abCorrente,
      }
    })
    .filter(s => s.presenteStagione)

  const soci = sociConStagione.map(({ presenteStagione, ...rest }) => rest)

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

          <SociList soci={soci} />

        </div>
      </main>
    </>
  )
}
