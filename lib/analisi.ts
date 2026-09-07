import { FUSO } from '@/lib/dataRoma'

/**
 * I conteggi che stanno dietro ai grafici della Dashboard.
 *
 * Stanno qui e non dentro la pagina per la stessa ragione di
 * `lib/ordinaSoci.ts`: raggruppare per giorno, settimana o mese ha un pugno di
 * scelte che si sbagliano facilmente — il fuso, i periodi vuoti, le soglie fra
 * i tre passi, i mesi che non durano tutti uguale — e dentro un componente non
 * si possono provare.
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
 * Ogni quanto si conta: giorno, settimana o mese.
 *
 * Non è una scelta sola, ed è il motivo per cui il grafico decide da sé. Una
 * stagione va da metà agosto a fine agosto, e le tre unità sbagliano in tre
 * momenti diversi:
 *
 * - **il mese** è la lettura giusta a giugno (dodici colonne, la forma
 *   dell'anno) e inutile a ottobre, quando le colonne sarebbero due;
 * - **la settimana** è giusta a novembre e inguardabile ad agosto, quando
 *   sarebbero cinquanta e il rumore — zero, uno, zero, due — coprirebbe il
 *   segnale;
 * - **il giorno** serve solo in apertura di stagione, che è l'unico momento in
 *   cui le iscrizioni arrivano abbastanza fitte da avere una forma quotidiana.
 *
 * Le soglie sotto tengono il numero di colonne **fra cinque e trentacinque**
 * per tutta la stagione. Erano piu' larghe alla prima scrittura, e provandole
 * sulle date vere si vedeva che il 31 ottobre il grafico aveva ancora
 * cinquantanove colonne giornaliere: su un telefono sono cinque pixel l'una.
 */
export type Passo = 'giorno' | 'settimana' | 'mese'

/** Il primo mese di stagione si conta per giorno: è la finestra in cui le
 *  iscrizioni arrivano a raffica e il giorno per giorno racconta qualcosa.
 *  Oltre, le colonne passerebbero la quarantina. */
const GIORNI_PRIMA_DELLE_SETTIMANE = 35

/** Oltre i cinque mesi le settimane passerebbero la ventina e poi la
 *  cinquantina: da lì in poi si conta per mese, che per il resto della
 *  stagione resta fra cinque e dodici colonne. */
const GIORNI_PRIMA_DEI_MESI = 140

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

/** Il primo giorno del mese di una data. I mesi non hanno tutti la stessa
 *  lunghezza, quindi non si possono raggruppare sommando giorni come si fa
 *  con le settimane: si passa dal calendario. */
function primoDelMese(giorno: string): string {
  return `${giorno.slice(0, 7)}-01`
}

function meseDopo(giorno: string): string {
  const [a, m] = giorno.split('-').map(Number)
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function etichettaDi(giorno: string, passo: Passo): string {
  const [, m, g] = giorno.split('-')
  // Per il mese basta il nome: una stagione non ripassa mai due volte dallo
  // stesso, quindi l'anno accanto sarebbe rumore.
  if (passo === 'mese') return MESI[Number(m) - 1]
  return `${g}/${m}`
}

export type Andamento = {
  punti: (Fetta & { giorno: string })[]
  passo: Passo
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
  const passo: Passo =
    ampiezza > GIORNI_PRIMA_DEI_MESI ? 'mese'
    : ampiezza > GIORNI_PRIMA_DELLE_SETTIMANE ? 'settimana'
    : 'giorno'

  // Il primo intervallo comincia dalla prima iscrizione per giorni e
  // settimane, ma dall'inizio del mese per i mesi: una colonna "mese" che
  // partisse dal 17 non sarebbe un mese.
  const inizio = passo === 'mese' ? primoDelMese(primo) : primo
  const avanti = (g: string) =>
    passo === 'mese' ? meseDopo(g) : aggiungiGiorni(g, passo === 'giorno' ? 1 : GIORNI_SETTIMANA)

  const conteggi = new Map<string, number>()
  for (const g of giorni) {
    let chiave: string
    if (passo === 'mese') {
      chiave = primoDelMese(g)
    } else {
      const salto = passo === 'giorno' ? 1 : GIORNI_SETTIMANA
      chiave = aggiungiGiorni(inizio, Math.floor(distanzaInGiorni(inizio, g) / salto) * salto)
    }
    conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1)
  }

  const punti: (Fetta & { giorno: string })[] = []
  for (let g = inizio; g <= fine; g = avanti(g)) {
    punti.push({
      giorno: g,
      etichetta: etichettaDi(g, passo),
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
