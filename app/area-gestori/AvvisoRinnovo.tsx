import { contattoDi, type DatiSocio } from '@/lib/contattiSocio'
import { formattaGiorno } from '@/lib/abbonamento'
import { quandoScade, type StatoCopertura } from '@/lib/scadenzeFrequenza'

/**
 * Una frequenza da rinnovare, nella Dashboard: di chi è, quando finisce, se
 * l'email automatica è partita, e un WhatsApp per dirglielo a voce.
 *
 * Il collegamento passa da `contatta/[id]?per=rinnovo` per la stessa ragione
 * della scheda delle richieste: è lì che si lascia il segno «avvisato da…»,
 * così due gestori non scrivono alla stessa persona.
 */
export function AvvisoRinnovo({
  periodo: p,
}: {
  periodo: {
    id: string
    nomeSocio: string
    socio: DatiSocio | null
    attivita: string
    fine: string | null
    giorni: number
    stato: StatoCopertura
    rinnovoChiesto: boolean
    emailIl: string | null
    avvisatoIl: string | null
    avvisatoDa: string | null
  }
}) {
  const contatto = p.socio ? contattoDi(p.socio) : null
  const scaduta = p.stato === 'scaduta'

  const ora = (iso: string) =>
    new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome',
    })

  return (
    <li
      className={`rounded-xl border px-4 py-3 space-y-2 ${
        p.rinnovoChiesto ? 'border-gray-100 bg-gray-50 opacity-70' : scaduta ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{p.nomeSocio}</p>
          <p className="text-xs text-gray-500 truncate">{p.attivita}</p>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              scaduta ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {quandoScade(p.giorni)}
          </span>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {scaduta ? 'Finita il' : 'Fino al'} {formattaGiorno(p.fine)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {p.rinnovoChiesto && (
          <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
            Rinnovo già richiesto: da confermare
          </span>
        )}
        <span className="px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-500">
          {p.emailIl ? `Email di promemoria inviata il ${ora(p.emailIl)}` : 'Email di promemoria non inviata'}
        </span>
        {p.avvisatoIl && (
          <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            Avvisato da {p.avvisatoDa ?? 'un gestore'} il {ora(p.avvisatoIl)}
          </span>
        )}
      </div>

      {!p.rinnovoChiesto && contatto?.telefono && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/area-gestori/contatta/${p.id}?per=rinnovo`}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${
              p.avvisatoIl
                ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {p.avvisatoIl ? 'Scrivi di nuovo' : 'Avvisa su WhatsApp'}
          </a>
          {contatto.perConto && (
            <span className="text-[10px] text-gray-400">a {contatto.destinatario}, per {contatto.perConto}</span>
          )}
        </div>
      )}
    </li>
  )
}
