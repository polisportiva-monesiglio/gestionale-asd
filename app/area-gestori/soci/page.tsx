import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'

function formatData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function badgeScadenza(scadenza: string | null) {
  if (!scadenza) return { label: 'Mancante', cls: 'bg-gray-100 text-gray-500' }
  const days = Math.ceil((new Date(scadenza).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Scaduto', cls: 'bg-red-100 text-red-700' }
  if (days <= 30) return { label: `${days}g`, cls: 'bg-yellow-100 text-yellow-700' }
  return { label: 'Valido', cls: 'bg-green-100 text-green-700' }
}

function badgeAbbonamento(stato: string | null) {
  if (!stato) return { label: 'Nessuno', cls: 'bg-gray-100 text-gray-500' }
  if (stato === 'pagato') return { label: 'Pagato', cls: 'bg-green-100 text-green-700' }
  return { label: 'Da saldare', cls: 'bg-yellow-100 text-yellow-700' }
}

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

          {/* Lista */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 p-6 sm:p-8">
            {soci.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nessun socio trovato.</p>
            ) : (
              <div className="space-y-3">
                {soci.map(s => {
                  const certBadge = badgeScadenza(s.scadenzaCert)
                  const abBadge = badgeAbbonamento(s.statoAbbonamento)
                  return (
                    <div key={s.id} className="rounded-2xl border border-gray-100 px-4 py-3 bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900">
                            {s.cognome} {s.nome}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{s.email ?? '—'}</p>
                          {s.telefono && <p className="text-xs text-gray-400">{s.telefono}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${abBadge.cls}`}>
                            {abBadge.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${certBadge.cls}`}>
                            Cert. {certBadge.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {s.nomeAttivita && (
                          <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-500">
                            {s.nomeAttivita}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                          Iscritto il {formatData(s.dataRegistrazione)}
                        </span>
                        {s.scadenzaCert && (
                          <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                            Cert. scade {formatData(s.scadenzaCert)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  )
}
