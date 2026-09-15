import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { etichettaInizio, formattaGiorno } from '@/lib/abbonamento'
import { etichettaMetodo } from '@/lib/pagamenti'
import { ConfermaCorso } from './ConfermaCorso'

/**
 * L'area del tecnico di un corso.
 *
 * Vede solo i propri corsi e, dei partecipanti, solo quello che serve a far
 * lezione: nome, cognome, se il certificato e' valido, se la quota e' in
 * regola. Niente codice fiscale, data di nascita, recapiti, dati del genitore
 * o documenti. Il limite non lo mette questa pagina: il tecnico non ha
 * nessun permesso di lettura su soci, tesseramenti e abbonamenti, e riceve i
 * dati solo da due funzioni del database che restituiscono quelle colonne e
 * nient'altro. Una pagina che nasconde dei campi si aggira; una colonna che non
 * arriva, no.
 */

type StatoCertificato = 'valido' | 'in_scadenza' | 'non_valido'

type Partecipante = {
  attivita_id: string
  corso: string
  nome: string | null
  cognome: string | null
  certificato: StatoCertificato
  quota_in_regola: boolean
  in_attesa: boolean
}

type Richiesta = {
  abbonamento_id: string
  attivita_id: string
  corso: string
  nome: string | null
  cognome: string | null
  prezzo: number | string | null
  quota_tesseramento: number | string | null
  metodo: string | null
  richiesta_il: string | null
  inizio_scelto: string | null
  data_inizio: string | null
  data_fine: string | null
  note: string | null
}

type Corso = { id: string; nome: string; attivo: boolean }

const CERTIFICATO: Record<StatoCertificato, { testo: string; cls: string }> = {
  valido: { testo: 'Valido', cls: 'bg-green-100 text-green-700' },
  in_scadenza: { testo: 'In scadenza', cls: 'bg-yellow-100 text-yellow-800' },
  non_valido: { testo: 'Non valido', cls: 'bg-red-100 text-red-700' },
}

function quota(p: Partecipante) {
  if (p.quota_in_regola) return { testo: 'In regola', cls: 'bg-green-100 text-green-700' }
  if (p.in_attesa) return { testo: 'Da confermare', cls: 'bg-yellow-100 text-yellow-800' }
  return { testo: 'Non in regola', cls: 'bg-red-100 text-red-700' }
}

export default async function AreaTecnicoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tecnico } = await supabase
    .from('tecnici')
    .select('id, nome, email')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!tecnico) {
    const { data: gestore } = await supabase
      .from('gestori')
      .select('id')
      .eq('user_id', user.id)
      .eq('attivo', true)
      .maybeSingle()
    redirect(gestore ? '/area-gestori' : '/auth/non-autorizzato')
  }

  const annoSportivo = getAnnoSportivo()

  const [
    { data: corsiRaw },
    { data: partecipantiRaw, error: errorePartecipanti },
    { data: richiesteRaw, error: erroreRichieste },
    { data: righeSocio },
  ] = await Promise.all([
    supabase
      .from('corsi_tecnici')
      .select('attivita_id, catalogo_attivita(nome_attivita, attivo)')
      .eq('tecnico_id', tecnico.id),
    supabase.rpc('partecipanti_miei_corsi'),
    supabase.rpc('richieste_miei_corsi'),
    supabase.from('soci').select('id').eq('user_id', user.id).limit(1),
  ])

  type RigaCorso = {
    attivita_id: string
    catalogo_attivita: { nome_attivita: string; attivo: boolean | null } | { nome_attivita: string; attivo: boolean | null }[] | null
  }

  const corsi: Corso[] = ((corsiRaw ?? []) as unknown as RigaCorso[])
    .map(r => {
      const c = Array.isArray(r.catalogo_attivita) ? r.catalogo_attivita[0] : r.catalogo_attivita
      return { id: r.attivita_id, nome: c?.nome_attivita ?? 'Corso', attivo: c?.attivo ?? false }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

  const partecipanti = (partecipantiRaw ?? []) as Partecipante[]
  const richieste = (richiesteRaw ?? []) as Richiesta[]
  const eAncheSocio = (righeSocio?.length ?? 0) > 0
  const nomeTecnico = tecnico.nome ?? tecnico.email

  return (
    <main className="min-h-screen bg-[#FAFAFA] py-10 px-4 font-sans text-gray-800">
      <div className="max-w-3xl mx-auto space-y-5">

        <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <img src="/logo-asd-monesiglio.png" alt="Logo" className="w-11 h-11 object-contain" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                  ASD Polisportiva Monesiglio
                </p>
                <h1 className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">
                  Area tecnico
                </h1>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {nomeTecnico} · stagione {annoSportivo}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {eAncheSocio && (
                <a
                  href="/area-socio"
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 border border-emerald-200 rounded-xl"
                >
                  La mia area socio
                </a>
              )}
              {/* L'uscita e' una POST, come nelle altre aree: la rotta risponde
                  solo a quella, e un collegamento semplice darebbe un errore
                  invece di chiudere la sessione. */}
              <form action="/auth/logout" method="post">
                <button type="submit" className="text-xs font-semibold text-gray-400 hover:text-gray-700">
                  Esci
                </button>
              </form>
            </div>
          </div>
        </div>

        {(errorePartecipanti || erroreRichieste) && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            Non è stato possibile leggere tutti i dati dei corsi. Riprova tra poco, e se
            continua avvisa la segreteria.
          </p>
        )}

        {corsi.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
            <p className="text-sm text-gray-500">
              Non sei ancora assegnato a nessun corso. Chiedi alla segreteria di assegnarti dal
              catalogo.
            </p>
          </div>
        ) : (
          corsi.map(corso => {
            const daConfermare = richieste.filter(r => r.attivita_id === corso.id)
            const iscritti = partecipanti.filter(p => p.attivita_id === corso.id)
            return (
              <section
                key={corso.id}
                className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-emerald-500 p-5 sm:p-7 space-y-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900">{corso.nome}</h2>
                  {!corso.attivo && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                      Non più a listino
                    </span>
                  )}
                </div>

                {daConfermare.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Pagamenti da confermare
                    </p>
                    {daConfermare.map(r => {
                      const totale = Number(r.prezzo ?? 0) + Number(r.quota_tesseramento ?? 0)
                      return (
                        <div key={r.abbonamento_id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900">
                                {r.cognome} {r.nome}
                              </p>
                              <p className="text-xs text-gray-500">
                                {etichettaMetodo(r.metodo)}
                                {r.richiesta_il && ` · richiesto il ${formattaGiorno(r.richiesta_il.slice(0, 10))}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-extrabold text-gray-900">€ {totale.toFixed(2)}</p>
                              {Number(r.quota_tesseramento ?? 0) > 0 && (
                                <p className="text-[10px] text-gray-500">
                                  compresi €{Number(r.quota_tesseramento).toFixed(0)} di tesseramento
                                </p>
                              )}
                            </div>
                          </div>
                          {r.data_inizio && (
                            <p className="text-xs text-gray-600">
                              {etichettaInizio(r.inizio_scelto)} — dal {formattaGiorno(r.data_inizio)} al{' '}
                              {formattaGiorno(r.data_fine)}
                            </p>
                          )}
                          {r.note && (
                            <p className="text-xs text-gray-500 italic border-l-2 border-amber-200 pl-2">{r.note}</p>
                          )}
                          <ConfermaCorso abbonamentoId={r.abbonamento_id} totale={totale} />
                        </div>
                      )
                    })}
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                    Partecipanti ({iscritti.length})
                  </p>
                  {iscritti.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">Ancora nessun iscritto per questa stagione.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                            <th scope="col" className="py-2 pr-3">Nome</th>
                            <th scope="col" className="py-2 pr-3">Certificato</th>
                            <th scope="col" className="py-2">Quota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {iscritti.map((p, i) => {
                            const cert = CERTIFICATO[p.certificato] ?? CERTIFICATO.non_valido
                            const q = quota(p)
                            return (
                              <tr key={`${p.cognome}-${p.nome}-${i}`} className="border-b border-gray-100 last:border-0">
                                <td className="py-2.5 pr-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
                                  {p.cognome} {p.nome}
                                </td>
                                <td className="py-2.5 pr-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cert.cls}`}>
                                    {cert.testo}
                                  </span>
                                </td>
                                <td className="py-2.5 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${q.cls}`}>
                                    {q.testo}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )
          })
        )}

        <div className="text-[11px] text-gray-400 leading-relaxed px-2 space-y-1">
          <p>
            <strong className="text-gray-500">Certificato «in scadenza»</strong>: scade entro 30
            giorni. Al socio arriva comunque un&apos;email automatica circa un mese prima, e lo
            vede nella sua area; se vuoi, puoi ricordarglielo a voce.
          </p>
          <p>
            <strong className="text-gray-500">Non valido</strong>: scaduto o mai caricato. Finché
            non lo carica non può partecipare.
          </p>
        </div>
      </div>
    </main>
  )
}
