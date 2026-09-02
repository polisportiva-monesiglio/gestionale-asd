import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { ElencoDaInviare, type SocioDaInviare } from './ElencoDaInviare'
import { StoricoInvii, type InvioFatto } from './StoricoInvii'

/** I campi che la UISP pretende: senza uno di questi la riga viene respinta. */
const OBBLIGATORI = [
  ['cognome', 'cognome'],
  ['nome', 'nome'],
  ['cf', 'codice fiscale'],
  ['data_nascita', 'data di nascita'],
  ['luogo_nascita', 'luogo di nascita'],
  ['citta', 'comune di residenza'],
] as const

type SocioRaw = {
  id: string
  cognome: string | null
  nome: string | null
  cf: string | null
  data_nascita: string | null
  luogo_nascita: string | null
  citta: string | null
  indirizzo: string | null
}

// Le relazioni annidate arrivano ora come oggetto, ora come array di uno: il
// resto dell'area gestori le legge gia' in entrambe le forme.
type RawTesseramento = {
  id: string
  timestamp_firma: string | null
  soci: SocioRaw | SocioRaw[] | null
}

function primo<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type RawInvio = {
  id: string
  numero: number
  creato_il: string
  conteggio: number
  annullato_il: string | null
  gestori: { nome: string | null } | { nome: string | null }[] | null
}

export default async function ModuloUispPage() {
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

  const [{ data: daInviareRaw }, { data: invatiRaw }, { data: quoteRaw }] = await Promise.all([
    supabase
      .from('tesseramenti_annuali')
      .select(`
        id, timestamp_firma,
        soci!inner(id, cognome, nome, cf, data_nascita, luogo_nascita, citta, indirizzo)
      `)
      .eq('anno_sportivo', annoSportivo)
      .is('invio_uisp_id', null)
      .order('timestamp_firma', { ascending: true }),
    supabase
      .from('invii_uisp')
      .select('id, numero, creato_il, conteggio, annullato_il, gestori(nome)')
      .eq('anno_sportivo', annoSportivo)
      .order('numero', { ascending: false }),
    // Chi ha già versato i 20 € della quota annuale: sono quelli che si possono
    // mandare senza che l'associazione anticipi la tessera di tasca propria.
    supabase
      .from('abbonamenti_soci')
      .select('socio_id')
      .eq('anno_sportivo', annoSportivo)
      .eq('stato_pagamento', 'pagato')
      .gt('importo_tesseramento_uisp', 0),
  ])

  const conQuotaVersata = new Set(
    ((quoteRaw ?? []) as { socio_id: string | null }[])
      .map(q => q.socio_id)
      .filter((v): v is string => !!v)
  )

  const daInviare: SocioDaInviare[] = ((daInviareRaw ?? []) as unknown as RawTesseramento[]).map(t => {
    const s = primo(t.soci)
    const mancanti = OBBLIGATORI.filter(([campo]) => !s?.[campo]).map(([, etichetta]) => etichetta)
    return {
      tesseramentoId: t.id,
      nominativo: [s?.cognome, s?.nome].filter(Boolean).join(' ') || '(senza nome)',
      cf: s?.cf ?? null,
      firmatoIl: t.timestamp_firma,
      quotaVersata: !!s && conQuotaVersata.has(s.id),
      mancanti,
    }
  })

  const invii: InvioFatto[] = ((invatiRaw ?? []) as unknown as RawInvio[]).map(i => ({
    id: i.id,
    numero: i.numero,
    creatoIl: i.creato_il,
    conteggio: i.conteggio,
    annullatoIl: i.annullato_il,
    gestore: primo(i.gestori)?.nome ?? null,
  }))

  return (
    <main className="min-h-screen bg-[#FAFAFA] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Tesseramenti per la UISP
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">Stagione {annoSportivo}</p>
          </div>
          <Link
            href="/area-gestori"
            className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-xl transition-colors"
          >
            ← Indietro
          </Link>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-7">
          <div className="flex items-center mb-1">
            <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
            <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
              Da mandare
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-5 pl-4">
            Scarichi il modulo già compilato e i soci scelti spariscono da qui: al prossimo
            invio trovi solo i nuovi. Il modulo esce con una riga per socio, né vuote né in meno.
          </p>
          <ElencoDaInviare soci={daInviare} />
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-7">
          <div className="flex items-center mb-1">
            <div className="w-1.5 h-5 bg-gray-300 rounded-full mr-2.5 shrink-0" />
            <h2 className="text-sm font-extrabold text-gray-900 tracking-tight">
              Invii già fatti
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-5 pl-4">
            Se un modulo non è mai partito, annullalo: quei soci tornano nell&apos;elenco qui sopra.
          </p>
          <StoricoInvii invii={invii} />
        </div>

      </div>
    </main>
  )
}
