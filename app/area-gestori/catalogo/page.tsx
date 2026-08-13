import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AttivitaRow } from './AttivitaRow'
import { NuovaAttivita } from './NuovaAttivita'

export default async function CatalogoPage() {
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

  const { data: catalogoRaw } = await supabase
    .from('catalogo_attivita')
    .select('id, nome_attivita, tipo, prezzo_base, durata_mesi, quantita_ingressi, attivo')
    .order('nome_attivita')

  const catalogo = catalogoRaw ?? []

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
                    Catalogo abbonamenti
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">{catalogo.length} voci</p>
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

          {/* Nuova voce */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-6 sm:p-8">
            <NuovaAttivita />
          </div>

          {/* Lista */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 p-6 sm:p-8">
            {catalogo.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nessuna voce nel catalogo.</p>
            ) : (
              <div className="space-y-3">
                {catalogo.map(a => (
                  <AttivitaRow
                    key={a.id}
                    id={a.id}
                    nome_attivita={a.nome_attivita}
                    tipo={a.tipo}
                    prezzo_base={Number(a.prezzo_base ?? 0)}
                    durata_mesi={a.durata_mesi ?? 0}
                    quantita_ingressi={a.quantita_ingressi ?? 0}
                    attivo={a.attivo ?? false}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  )
}
