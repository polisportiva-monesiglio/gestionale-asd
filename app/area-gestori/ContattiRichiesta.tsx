import { contattoDi, linkWhatsApp, type DatiSocio, type Periodo } from '@/lib/contattiSocio'

/**
 * I contatti dentro la scheda di una richiesta: servono a chiedere un
 * chiarimento prima di confermare o rifiutare.
 *
 * Chi contattare lo decide `contattoDi`: per un minorenne si scrive a chi ha
 * firmato per lui, e il numero del ragazzo non compare.
 *
 * Niente email: la richiesta si chiarisce a voce o su WhatsApp, e
 * l'indirizzo del socio e' gia' scritto in cima alla scheda.
 */
export function ContattiRichiesta({
  socio,
  attivita,
  periodo,
}: {
  socio: DatiSocio | null
  attivita: string
  periodo?: Periodo
}) {
  if (!socio) return null

  const contatto = contattoDi(socio)
  if (!contatto.telefono) return null
  const whatsapp = linkWhatsApp(contatto, attivita, periodo)

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {contatto.perConto
          ? `Scrivi a ${contatto.destinatario}, per ${contatto.perConto}`
          : `Scrivi a ${contatto.destinatario}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          >
            WhatsApp
          </a>
        )}
        <a
          href={`tel:${contatto.telefono}`}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
        >
          Chiama
        </a>
      </div>
    </div>
  )
}
