import { partiRomane } from '@/lib/dataRoma'

/**
 * Da quando parte un abbonamento. Lo sceglie il socio quando fa la richiesta.
 *
 * Non c'è più una soglia nel mese che decide al posto suo: chi vuole entrare
 * oggi parte oggi e paga anche i giorni già passati del mese, chi non ha
 * fretta aspetta il primo del mese prossimo e non perde niente. La scelta è
 * un'informazione, non un calcolo: per questo viene registrata insieme alle
 * date, così a distanza di mesi si sa che cosa il socio aveva chiesto e non
 * solo che cosa gli è stato dato.
 */
export type InizioScelto = 'mese_corrente' | 'mese_successivo'

export const INIZI: readonly InizioScelto[] = ['mese_corrente', 'mese_successivo']

export function inizioValido(valore: unknown): valore is InizioScelto {
  return typeof valore === 'string' && (INIZI as readonly string[]).includes(valore)
}

export type Periodo = { dataInizio: string; dataFine: string }

/** Ultimo giorno del mese, con gli anni bisestili gestiti da Date stesso. */
function ultimoGiornoDelMese(anno: number, mese: number): number {
  // Il giorno 0 del mese successivo è l'ultimo del mese richiesto.
  return new Date(Date.UTC(anno, mese, 0)).getUTCDate()
}

function iso(anno: number, mese: number, giorno: number): string {
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

/**
 * Il periodo di validità, dalla scelta del socio e dalla durata dell'attività.
 *
 * L'abbonamento **finisce sempre a fine mese**, mai a metà: un trimestrale
 * scelto "dal mese in corso" il 19 marzo vale dal 19 marzo al 31 maggio, cioè
 * marzo più i due mesi pieni successivi. Lo stesso trimestrale scelto "dal
 * mese successivo" vale dal 1° aprile al 30 giugno: tre mesi pieni.
 *
 * Le date sono giorni di calendario e vanno lette nel fuso di Monesiglio, non
 * in quello del server: alle 00:30 del primo marzo il server in UTC è ancora
 * al 28 febbraio, e senza `partiRomane` un abbonamento chiesto quella notte
 * partirebbe da un mese sbagliato.
 */
export function periodoAbbonamento(
  inizio: InizioScelto,
  durataMesi: number,
  adesso: Date = new Date()
): Periodo | null {
  // Le attività a ingressi non hanno un arco di mesi da calcolare. Meglio
  // nessuna data che due date inventate.
  if (!Number.isInteger(durataMesi) || durataMesi < 1) return null

  const { anno, mese, giorno } = partiRomane(adesso)

  // Mese da cui si conta la durata, e giorno in cui si comincia davvero.
  const mesePartenza = inizio === 'mese_corrente' ? mese : mese + 1
  const giornoPartenza = inizio === 'mese_corrente' ? giorno : 1

  // Normalizza il passaggio d'anno: dicembre + 1 = gennaio dell'anno dopo.
  const annoInizio = anno + Math.floor((mesePartenza - 1) / 12)
  const meseInizio = ((mesePartenza - 1) % 12) + 1

  const meseFineAssoluto = mesePartenza + durataMesi - 1
  const annoFine = anno + Math.floor((meseFineAssoluto - 1) / 12)
  const meseFine = ((meseFineAssoluto - 1) % 12) + 1

  return {
    dataInizio: iso(annoInizio, meseInizio, giornoPartenza),
    dataFine: iso(annoFine, meseFine, ultimoGiornoDelMese(annoFine, meseFine)),
  }
}

/** Come si legge la scelta a schermo, per il socio e per il gestore. */
export function etichettaInizio(inizio: string | null | undefined): string {
  if (inizio === 'mese_corrente') return 'Dal mese in corso'
  if (inizio === 'mese_successivo') return 'Dal mese successivo'
  return 'Non indicato'
}

export function formattaGiorno(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, g] = iso.split('-')
  return a && m && g ? `${g}/${m}/${a}` : '—'
}
