import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AggiungiGestoreForm } from './AggiungiGestoreForm'
import { GestoreRow } from './GestoreRow'
import { TecnicoRow } from './TecnicoRow'
import { AggiungiTecnicoForm } from './AggiungiTecnicoForm'

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
    .select('id, user_id, nome, email, telefono, attivo, is_admin')
    .order('email')

  const gestori = gestoriRaw ?? []

  const [{ data: tecniciRaw }, { data: corsiRaw }] = await Promise.all([
    supabase
      .from('tecnici')
      .select('id, user_id, nome, email, telefono, attivo, corsi_tecnici(attivita_id)')
      .order('email'),
    // Anche i corsi tolti dal listino: un tecnico puo' restarci assegnato, e
    // la sua casella deve comparire spuntata invece di sparire.
    supabase
      .from('catalogo_attivita')
      .select('id, nome_attivita, attivo')
      .eq('tipo', 'corso')
      .order('nome_attivita'),
  ])

  type RawTecnico = {
    id: string
    user_id: string | null
    nome: string | null
    email: string
    telefono: string | null
    attivo: boolean | null
    corsi_tecnici: { attivita_id: string }[] | null
  }

  const corsi = (corsiRaw ?? []).map(c => ({ id: c.id, nome: c.nome_attivita, attivo: c.attivo ?? false }))

  const tecnici = ((tecniciRaw ?? []) as unknown as RawTecnico[]).map(t => ({
    ...t,
    corsiAssegnati: (t.corsi_tecnici ?? []).map(r => r.attivita_id),
  }))

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
                    telefono={g.telefono ?? null}
                    attivo={g.attivo ?? false}
                    isAdmin={g.is_admin ?? false}
                    isSelf={g.id === gestoreCorrente.id}
                    haClaim={!!g.user_id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tecnici dei corsi */}
          <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-emerald-500 p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Tecnici dei corsi</h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Un tecnico entra con la sua email e vede solo i partecipanti dei corsi a cui lo
                assegni, qui con «Assegna corsi» o dal catalogo: nome, cognome, se il certificato è
                valido, se la quota è in regola e fino a quando è pagata. Conferma i pagamenti di
                quei corsi. Non vede codice fiscale, data di nascita, recapiti, dati del genitore né
                certificati.
              </p>
            </div>
            <AggiungiTecnicoForm />
            {tecnici.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nessun tecnico.</p>
            ) : (
              <div className="space-y-3">
                {tecnici.map(t => (
                  <TecnicoRow
                    key={t.id}
                    id={t.id}
                    nome={t.nome}
                    email={t.email}
                    telefono={t.telefono}
                    attivo={t.attivo ?? false}
                    haClaim={!!t.user_id}
                    corsiAssegnati={t.corsiAssegnati}
                    corsi={corsi}
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
