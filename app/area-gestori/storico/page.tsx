import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { leggiDecisioni } from '@/lib/storicoDecisioni'
import { ListaDecisioni } from '../ListaDecisioni'
import { StagioneSelect } from '../soci/StagioneSelect'

/**
 * Lo storico delle richieste gia' decise: chi ha accettato o rifiutato cosa, e
 * quando.
 *
 * La prima pagina dell'area gestori mostra solo le richieste in attesa, cioe'
 * il lavoro da fare. Una volta decisa, una richiesta spariva dalla vista: la
 * decisione restava scritta in tabella ma nessuno poteva piu' rileggerla senza
 * aprire il database.
 */
export default async function StoricoPage({
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
  const stagione = stagioneParam || annoCorrente

  const { data: stagioniRaw } = await supabase
    .from('abbonamenti_soci')
    .select('anno_sportivo')

  const stagioni = Array.from(
    new Set([annoCorrente, ...(stagioniRaw ?? []).map(a => a.anno_sportivo).filter((s): s is string => !!s)])
  ).sort((a, b) => b.localeCompare(a))

  const { decisioni, errore } = await leggiDecisioni(supabase, { annoSportivo: stagione })

  const accettate = decisioni.filter(d => d.esito === 'accettata').length
  const rifiutate = decisioni.length - accettate

  return (
    <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 font-sans text-gray-800">
      <div className="max-w-3xl mx-auto space-y-5">

        <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/logo-asd-monesiglio.png" alt="Logo" className="w-11 h-11 object-contain" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                  ASD Polisportiva Monesiglio
                </p>
                <h1 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">
                  Storico delle richieste
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {accettate} accettate · {rifiutate} rifiutate
                </p>
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

        <StagioneSelect stagioni={stagioni} selezionata={stagione} base="/area-gestori/storico" />

        <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-7">
          {errore ? (
            <p className="text-sm text-red-600">Lettura dello storico fallita: {errore}</p>
          ) : (
            <ListaDecisioni
              decisioni={decisioni}
              vuoto={`Nessuna richiesta ancora decisa per la stagione ${stagione}.`}
            />
          )}
        </div>

      </div>
    </main>
  )
}
