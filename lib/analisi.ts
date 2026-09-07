import { FUSO } from '@/lib/dataRoma'

/**
 * I conteggi che stanno dietro ai grafici della Dashboard.
 *
 * Stanno qui e non dentro la pagina per la stessa ragione di
 * `lib/ordinaSoci.ts`: raggruppare per giorno o per settimana ha un paio di
 * scelte che si sbagliano facilmente — il fuso, i periodi vuoti, la soglia fra
 * i due passi — e dentro un componente non si possono provare.
 */

export type Fetta = { etichetta: string; valore: number }

/** Il giorno a Monesiglio, non quello del server (che gira in UTC). */
function giornoRomano(istante: string | Date): string {
  const d = typeof istante === 'string' ? new Date(istante) : istante
  if (Number.isNaN(d.getTime())) return ''
  // `sv-SE` è la scorciatoia onesta per avere AAAA-MM-GG.
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO })
}

/**
 * Quante volte compare ogni valore, dal più frequente al meno.
 *
 * A parità si ordina per etichetta, se no due voci con lo stesso conteggio si
 * scambiano di posto a ogni ricarica della pagina e il grafico sembra
 * cambiare da solo.
 */
export function contaPer<T>(righe: T[], chiave: (r: T) => string | null | undefined): Fetta[] {
  const conteggi = new Map<string, number>()
  for (const r of righe) {
    const k = chiave(r)
    if (!k) continue
    conteggi.set(k, (conteggi.get(k) ?? 0) + 1)
  }
  return [...conteggi.entries()]
    .map(([etichetta, valore]) => ({ etichetta, valore }))
    .sort((a, b) => b.valore - a.valore || a.etichetta.localeCompare(b.etichetta, 'it'))
}

/**
 * Sotto questa soglia si conta per giorno, sopra per settimana.
 *
 * Una stagione dura undici mesi: a fine anno un grafico per giorno avrebbe
 * trecento colonne larghe un pelo, illeggibili su qualunque schermo. A inizio
 * stagione invece le settimane sarebbero due, e non direbbero niente.
 */
const GIORNI_PRIMA_DI_PASSARE_ALLE_SETTIMANE = 45

const GIORNI_SETTIMANA = 7
const MS_IN_UN_GIORNO = 86400000

function aggiungiGiorni(giorno: string, quanti: number): string {
  const d = new Date(`${giorno}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + quanti)
  return d.toISOString().slice(0, 10)
}

function distanzaInGiorni(da: string, a: string): number {
  return Math.round(
    (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${da}T12:00:00Z`).getTime()) / MS_IN_UN_GIORNO
  )
}

function etichettaGiorno(giorno: string): string {
  const [, m, g] = giorno.split('-')
  return `${g}/${m}`
}

export type Andamento = {
  punti: (Fetta & { giorno: string })[]
  passo: 'giorno' | 'settimana'
  totale: number
}

/**
 * L'andamento delle iscrizioni nel tempo.
 *
 * **I periodi vuoti ci sono lo stesso, col valore zero.** È la differenza fra
 * un grafico che dice la verità e uno che mente per omissione: saltando i
 * giorni senza iscrizioni, tre iscritti in tre settimane diverse disegnano la
 * stessa riga piatta di tre iscritti in tre giorni di fila.
 */
export function andamentoIscrizioni(istanti: (string | null)[], oggi: Date = new Date()): Andamento {
  const giorni = istanti
    .map(i => (i ? giornoRomano(i) : ''))
    .filter(g => g !== '')
    .sort()

  if (giorni.length === 0) return { punti: [], passo: 'giorno', totale: 0 }

  const primo = giorni[0]
  const ultimo = giornoRomano(oggi)
  // Se qualcuno si è iscritto "domani" (orologi, fusi, dati di collaudo) la
  // finestra non deve chiudersi prima dell'ultimo dato.
  const fine = ultimo > giorni[giorni.length - 1] ? ultimo : giorni[giorni.length - 1]

  const ampiezza = distanzaInGiorni(primo, fine) + 1
  const passo: 'giorno' | 'settimana' =
    ampiezza > GIORNI_PRIMA_DI_PASSARE_ALLE_SETTIMANE ? 'settimana' : 'giorno'
  const salto = passo === 'giorno' ? 1 : GIORNI_SETTIMANA

  const conteggi = new Map<string, number>()
  for (const g of giorni) {
    const indice = Math.floor(distanzaInGiorni(primo, g) / salto)
    const inizio = aggiungiGiorni(primo, indice * salto)
    conteggi.set(inizio, (conteggi.get(inizio) ?? 0) + 1)
  }

  const punti: (Fetta & { giorno: string })[] = []
  for (let g = primo; g <= fine; g = aggiungiGiorni(g, salto)) {
    punti.push({
      giorno: g,
      etichetta: etichettaGiorno(g),
      valore: conteggi.get(g) ?? 0,
    })
  }

  return { punti, passo, totale: giorni.length }
}

/**
 * Quanti giorni mancano a una scadenza, contati sul calendario e non sulle ore.
 *
 * `Math.ceil` sulla differenza di millisecondi fa scattare "manca un giorno" a
 * un orario che dipende da quando si apre la pagina: alle 23 di lunedì e alle
 * 8 di martedì la stessa scadenza dice numeri diversi.
 */
export function giorniAllaScadenza(scadenza: string, oggi: Date = new Date()): number {
  return distanzaInGiorni(giornoRomano(oggi), scadenza.slice(0, 10))
}
