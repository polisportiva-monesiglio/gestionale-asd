'use client'

import { useRef, useState, type RefObject } from 'react'
import {
  IBAN,
  INTESTATARIO_CONTO,
  ibanLeggibile,
  causaleBonifico,
  linkSatispay,
} from '@/lib/pagamenti'

/**
 * Come pagare, mostrato sotto la scelta del metodo.
 *
 * Per il bonifico ogni dato ha il suo pulsante "Copia". Non e' un vezzo:
 * ricopiare a mano ventisette caratteri di IBAN dal telefono all'app della
 * banca e' il modo piu' sicuro di sbagliarne uno, e la causale compilata e'
 * quella che permette ai gestori di capire di chi e' il bonifico.
 */

/**
 * Il vecchio modo di copiare: un campo nascosto, selezionato, e il comando
 * "copia" del documento. E' deprecato ma funziona ancora proprio dove l'API
 * degli appunti viene negata — i browser interni di Gmail, Instagram,
 * WhatsApp, da cui i soci aprono il link del sito. E' lo stesso ambiente che a
 * settembre 2026 rompeva l'accesso col link: meglio non fidarsi.
 */
function copiaAllaVecchia(testo: string): boolean {
  const campo = document.createElement('textarea')
  campo.value = testo
  campo.setAttribute('readonly', '')
  campo.style.position = 'fixed'
  campo.style.opacity = '0'
  document.body.appendChild(campo)
  campo.select()
  let riuscito = false
  try {
    riuscito = document.execCommand('copy')
  } catch {
    riuscito = false
  }
  document.body.removeChild(campo)
  return riuscito
}

function Copia({
  testo,
  etichetta,
  bersaglio,
}: {
  testo: string
  etichetta: string
  /** Il testo visibile accanto: se copiare non riesce in nessun modo, lo si
   *  seleziona, e a chi e' sul telefono basta tenere premuto e scegliere "Copia". */
  bersaglio: RefObject<HTMLElement | null>
}) {
  const [stato, setStato] = useState<'fermo' | 'copiato' | 'errore'>('fermo')

  async function copia() {
    let riuscito = false
    try {
      await navigator.clipboard.writeText(testo)
      riuscito = true
    } catch {
      riuscito = copiaAllaVecchia(testo)
    }

    if (!riuscito && bersaglio.current) {
      const intervallo = document.createRange()
      intervallo.selectNodeContents(bersaglio.current)
      const selezione = window.getSelection()
      selezione?.removeAllRanges()
      selezione?.addRange(intervallo)
    }

    setStato(riuscito ? 'copiato' : 'errore')
    setTimeout(() => setStato('fermo'), 2500)
  }

  return (
    <button
      type="button"
      onClick={copia}
      aria-label={`Copia ${etichetta}`}
      className={`shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
        stato === 'copiato'
          ? 'border-green-300 bg-green-50 text-green-700'
          : stato === 'errore'
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {stato === 'copiato' ? 'Copiato ✓' : stato === 'errore' ? 'Selezionato: tieni premuto' : 'Copia'}
    </button>
  )
}

function Riga({
  etichetta,
  valore,
  daCopiare,
  mono,
}: {
  etichetta: string
  valore: string
  daCopiare: string
  mono?: boolean
}) {
  const testoVisibile = useRef<HTMLParagraphElement>(null)
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{etichetta}</p>
        <p
          ref={testoVisibile}
          className={`text-sm text-gray-900 break-all select-all ${mono ? 'font-mono tracking-wide' : 'font-semibold'}`}
        >
          {valore}
        </p>
      </div>
      <Copia testo={daCopiare} etichetta={etichetta.toLowerCase()} bersaglio={testoVisibile} />
    </div>
  )
}

export function IstruzioniPagamento({
  metodo,
  totale,
  nomeSocio,
  nomeAttivita,
  annoSportivo,
}: {
  metodo: string
  totale: number | null
  nomeSocio: string
  nomeAttivita: string | null
  annoSportivo: string
}) {
  if (!metodo) return null

  // Senza il periodo scelto non c'e' un importo, e dati di pagamento senza
  // importo invitano a mandare una cifra a caso.
  if (totale === null || !nomeAttivita) {
    if (metodo === 'contanti') return null
    return (
      <p className="text-xs text-gray-400 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
        Scegli prima il periodo: poi qui compaiono i dati per pagare, con l&apos;importo giusto.
      </p>
    )
  }

  if (metodo === 'contanti') {
    return (
      <p className="text-xs text-gray-500 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
        Paghi <strong>€{totale}</strong> in contanti a un consigliere, in sede.
      </p>
    )
  }

  if (metodo === 'bonifico') {
    const causale = causaleBonifico({ nomeSocio, attivita: nomeAttivita, annoSportivo })
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2">
        <Riga etichetta="Intestatario" valore={INTESTATARIO_CONTO} daCopiare={INTESTATARIO_CONTO} />
        <Riga etichetta="IBAN" valore={ibanLeggibile()} daCopiare={IBAN} mono />
        <Riga etichetta="Importo" valore={`€${totale}`} daCopiare={String(totale)} />
        <Riga etichetta="Causale" valore={causale} daCopiare={causale} />
        <p className="text-[11px] text-gray-400 leading-relaxed py-2.5">
          Fai il bonifico e poi invia la richiesta: la segreteria la conferma quando vede
          arrivare il pagamento, di solito in un paio di giorni lavorativi.
        </p>
      </div>
    )
  }

  if (metodo === 'satispay') {
    const s = linkSatispay(totale)
    if (!s) {
      return (
        <p className="text-xs text-gray-500 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          Paghi <strong>€{totale}</strong> con Satispay a un consigliere, in sede.
        </p>
      )
    }
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 space-y-2.5">
        {!s.importoGiaDentro && (
          <Riga etichetta="Importo da inserire" valore={`€${totale}`} daCopiare={String(totale)} />
        )}
        <a
          href={s.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-xl bg-[#FA3E3E] hover:bg-[#e23535] text-white text-sm font-bold py-3 transition-colors"
        >
          Paga €{totale} con Satispay
        </a>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          {s.importoGiaDentro
            ? 'L’importo è già impostato. Dopo aver pagato, torna qui e invia la richiesta.'
            : `Si apre Satispay: inserisci €${totale}. Dopo aver pagato, torna qui e invia la richiesta.`}
        </p>
      </div>
    )
  }

  return null
}
