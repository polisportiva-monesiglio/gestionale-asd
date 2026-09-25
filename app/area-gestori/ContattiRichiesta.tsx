import { contattoDi, type DatiSocio } from '@/lib/contattiSocio'

/**
 * Il contatto dentro la scheda di una richiesta: serve a chiedere un
 * chiarimento prima di confermare o rifiutare.
 *
 * Chi contattare lo decide `contattoDi`: per un minorenne si scrive a chi ha
 * firmato per lui, e il numero del ragazzo non compare.
 *
 * Solo WhatsApp, e non anche email o telefonata: il segno di «già contattato»
 * si può lasciare soltanto su quello che passa di qui, e due modi di scrivere
 * di cui uno non lascia traccia renderebbero il segno inaffidabile — che è
 * peggio del non averlo.
 *
 * Il collegamento punta a una rotta del sito, non direttamente a WhatsApp:
 * è lì che il contatto viene segnato, e cosí il segno non dipende dal
 * JavaScript della pagina. Vedi `contatta/[id]/route.ts`.
 */
export function ContattiRichiesta({
  socio,
  abbonamentoId,
  contattatoDa,
  contattatoIl,
}: {
  socio: DatiSocio | null
  abbonamentoId: string
  contattatoDa: string | null
  contattatoIl: string | null
}) {
  if (!socio) return null

  const contatto = contattoDi(socio)
  if (!contatto.telefono) return null

  // Il server gira in UTC: senza fuso, un contatto delle 00:30 risulterebbe
  // del giorno prima. Stessa attenzione del PDF del modulo firmato.
  const quando = contattatoIl
    ? new Date(contattatoIl).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Rome',
      })
    : null

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {contatto.perConto
          ? `Scrivi a ${contatto.destinatario}, per ${contatto.perConto}`
          : `Scrivi a ${contatto.destinatario}`}
      </p>

      {quando && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          Già contattato da {contattatoDa ?? 'un gestore'} il {quando}
        </p>
      )}

      <a
        href={`/area-gestori/contatta/${abbonamentoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${
          quando
            ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
        }`}
      >
        {quando ? 'Scrivi di nuovo' : 'WhatsApp'}
      </a>
    </div>
  )
}
