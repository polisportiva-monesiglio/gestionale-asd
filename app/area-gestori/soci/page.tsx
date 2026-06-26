import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { SociList } from './SociList'

export default async function ListaSociPage() {
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

  const annoSportivo = getAnnoSportivo()

  const { data: sociRaw } = await supabase
    .from('soci')
    .select(`
      id, nome, cognome, email, telefono, data_registrazione,
      tesseramenti_annuali(anno_sportivo, data_scadenza_certificato),
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
    tesseramenti_annuali: { anno_sportivo: string; data_scadenza_certificato: string | null }[] | null
    abbonamenti_soci: {
      anno_sportivo: string | null
      stato_pagamento: string | null
      data_acquisto: string | null
      catalogo_attivita: { nome_attivita: string }[] | { nome_attivita: string } | null
    }[] | null
  }

  const soci = ((sociRaw ?? []) as unknown as RawSocio[]).map(s => {
    const tess = (s.tesseramenti_annuali ?? []).find(t => t.anno_sportivo === annoSportivo) ?? null
    const absCorrenti = (s.abbonamenti_soci ?? []).filter(a => a.anno_sportivo === annoSportivo)
    const abPagato = absCorrenti.find(a => a.stato_pagamento === 'pagato')
    const abPending = absCorrenti.find(a => a.stato_pagamento === 'da_saldare')
    const abCorrente = abPagato ?? abPending ?? null
    const attivita = abCorrente?.catalogo_attivita
    const nomeAtt = Array.isArray(attivita) ? attivita[0]?.nome_attivita : (attivita as { nome_attivita: string } | null)?.nome_attivita

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
    }
  })

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); body { font-family: 'Inter', sans-serif; }` }} />

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
                  <p className="text-xs text-gray-400 mt-0.5">Stagione {annoSportivo} · {soci.length} iscritti</p>
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

          <SociList soci={soci} />

        </div>
      </main>
    </>
  )
}
