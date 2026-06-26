import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { ConfermaButton } from './ConfermaButton'
import { MenuDrawer } from './MenuDrawer'

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

function metodoPagamentoBadge(metodo: string | null) {
  const map: Record<string, string> = {
    contanti: 'Contanti',
    bonifico: 'Bonifico',
    carta: 'Carta',
    satispay: 'Satispay',
  }
  return map[metodo ?? ''] ?? metodo ?? '—'
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
  ] = await Promise.all([
    supabase
      .from('abbonamenti_soci')
      .select(`
        id, importo_tesseramento_uisp, metodo_pagamento, data_acquisto, note_socio,
        catalogo_attivita(nome_attivita, prezzo_base),
        soci(nome, cognome, email)
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
  ])

  type RawRichiesta = {
    id: string
    importo_tesseramento_uisp: number | null
    metodo_pagamento: string | null
    data_acquisto: string | null
    note_socio: string | null
    catalogo_attivita: { nome_attivita: string; prezzo_base: number | null }[] | { nome_attivita: string; prezzo_base: number | null } | null
    soci: { nome: string; cognome: string; email: string | null }[] | { nome: string; cognome: string; email: string | null } | null
  }

  const richieste = ((richiesteRaw ?? []) as unknown as RawRichiesta[]).map(r => {
    const att = Array.isArray(r.catalogo_attivita) ? r.catalogo_attivita[0] : r.catalogo_attivita
    const s = Array.isArray(r.soci) ? r.soci[0] : r.soci
    return {
      id: r.id,
      nomeSocio: s ? `${s.nome} ${s.cognome}` : '—',
      emailSocio: s?.email ?? null,
      nomeAttivita: att?.nome_attivita ?? '—',
      prezzoBase: Number(att?.prezzo_base ?? 0),
      uisp: Number(r.importo_tesseramento_uisp ?? 0),
      metodo: r.metodo_pagamento,
      dataRichiesta: r.data_acquisto,
      note: r.note_socio,
    }
  })

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
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); body { font-family: 'Inter', sans-serif; }` }} />

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

          {/* Riquadri affiancati */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* Richieste pagamento */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Richieste di pagamento</h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                {richieste.length} in attesa
              </span>
            </div>

            {richieste.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessuna richiesta in attesa.</p>
            ) : (
              <div className="space-y-4">
                {richieste.map(r => (
                  <div key={r.id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-gray-900">{r.nomeSocio}</p>
                        {r.emailSocio && <p className="text-xs text-gray-400">{r.emailSocio}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold text-blue-700">
                          € {(r.prezzoBase + r.uisp).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-gray-400">{metodoPagamentoBadge(r.metodo)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-600">
                        {r.nomeAttivita}
                      </span>
                      {r.uisp > 0 && (
                        <span className="px-2 py-0.5 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                          +€{r.uisp} UISP
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                        {formatData(r.dataRichiesta)}
                      </span>
                    </div>

                    {r.note && (
                      <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                        {r.note}
                      </p>
                    )}

                    <ConfermaButton abbonamentoId={r.id} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Certificati in scadenza */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-orange-400 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Certificati medici</h2>
              {certInScadenza.length > 0 && (
                <span className="px-2.5 py-0.5 bg-orange-50 text-orange-700 text-xs font-bold rounded-full">
                  {certInScadenza.length} da controllare
                </span>
              )}
            </div>

            {certInScadenza.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Nessun certificato scaduto o in scadenza entro 30 giorni.
              </p>
            ) : (
              <div className="space-y-2">
                {certInScadenza.map(c => {
                  const badge = badgeScadenza(c.scadenza)
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 bg-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{c.nomeSocio}</p>
                        {c.emailSocio && <p className="text-xs text-gray-400">{c.emailSocio}</p>}
                      </div>
                      <div className="text-right">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatData(c.scadenza)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          </div>{/* fine grid affiancato */}

        </div>
      </main>
    </>
  )
}
