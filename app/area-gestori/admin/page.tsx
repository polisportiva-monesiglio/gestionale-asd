import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AggiungiGestoreForm } from './AggiungiGestoreForm'
import { GestoreRow } from './GestoreRow'

export default async function AdminGestoriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: gestoreCorrente } = await supabase
    .from('gestori')
    .select('id, nome, is_admin')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestoreCorrente) redirect('/auth/non-autorizzato')
  if (!gestoreCorrente.is_admin) redirect('/area-gestori')

  const { data: gestoriRaw } = await supabase
    .from('gestori')
    .select('id, user_id, nome, email, attivo, is_admin')
    .order('email')

  const gestori = gestoriRaw ?? []

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
                    Gestione gestori
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">{gestori.length} gestori registrati</p>
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

          {/* Aggiungi gestore */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-6 sm:p-8">
            <h2 className="text-base font-bold text-gray-900 mb-1">Aggiungi gestore</h2>
            <p className="text-xs text-gray-400 mb-4">
              Inserisci l&apos;email: la persona potrà accedere all&apos;area gestori al primo login con quell&apos;account.
            </p>
            <AggiungiGestoreForm />
          </div>

          {/* Lista gestori */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 p-6 sm:p-8">
            <h2 className="text-base font-bold text-gray-900 mb-4">Gestori</h2>
            {gestori.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessun gestore trovato.</p>
            ) : (
              <div className="space-y-3">
                {gestori.map(g => (
                  <GestoreRow
                    key={g.id}
                    id={g.id}
                    nome={g.nome}
                    email={g.email}
                    attivo={g.attivo ?? false}
                    isAdmin={g.is_admin ?? false}
                    isSelf={g.id === gestoreCorrente.id}
                    haClaim={!!g.user_id}
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
