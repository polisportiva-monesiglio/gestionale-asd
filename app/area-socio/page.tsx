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
  ] = await Promise.all([
    supabase
      .from('tesseramenti_annuali')
      .select('id, data_scadenza_certificato, url_certificato_pdf')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .maybeSingle(),
    supabase
      .from('abbonamenti_soci')
      .select('id, stato_pagamento, importo_tesseramento_uisp, note_socio, data_acquisto, catalogo_attivita(nome_attivita, prezzo_base)')
      .eq('socio_id', socio?.id ?? '')
      .eq('anno_sportivo', annoSportivo)
      .order('data_acquisto', { ascending: false }),
    supabase
      .from('catalogo_attivita')
      .select('id, nome_attivita, tipo, prezzo_base')
      .eq('attivo', true)
      .order('nome_attivita'),
  ])

  // URL firmato per il certificato corrente (valido 1h)
  let certificatoUrl: string | null = null
  if (tesseramento?.url_certificato_pdf) {
    const { data } = await supabase.storage
      .from('certificati-medici')
      .createSignedUrl(tesseramento.url_certificato_pdf, 3600)
    certificatoUrl = data?.signedUrl ?? null
  }

  // Appiattisce il join catalogo_attivita per passare dati serializzabili al client
  type RawAb = {
    id: string
    stato_pagamento: string
    importo_tesseramento_uisp: number | null
    note_socio: string | null
    data_acquisto: string | null
    catalogo_attivita: { nome_attivita: string; prezzo_base: number | null }[] | { nome_attivita: string; prezzo_base: number | null } | null
  }

  const abbonamentiFlattenati = ((abbonamenti ?? []) as unknown as RawAb[]).map(ab => {
    const act = Array.isArray(ab.catalogo_attivita)
      ? ab.catalogo_attivita[0] ?? null
      : ab.catalogo_attivita
    return {
      id: ab.id,
      stato_pagamento: ab.stato_pagamento,
      importo_tesseramento_uisp: ab.importo_tesseramento_uisp,
      note_socio: ab.note_socio,
      data_acquisto: ab.data_acquisto,
      nome_attivita: act?.nome_attivita ?? null,
      prezzo_base: act?.prezzo_base ?? null,
    }
  })

  const hasPending = abbonamentiFlattenati.some(a => a.stato_pagamento === 'da_saldare')
  const uispApplicabile = !abbonamentiFlattenati.some(a => a.stato_pagamento === 'pagato')

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
              abbonamenti={abbonamentiFlattenati}
              attivita={attivita ?? []}
              hasPending={hasPending}
              uispApplicabile={uispApplicabile}
              annoSportivo={annoSportivo}
            />
          </div>

        </div>
      </main>
    </>
  )
}
