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

/**
 * L'ultimo giorno che un abbonamento di questa stagione può coprire.
 *
 * La stagione sportiva scatta il 15 agosto (vedi `getAnnoSportivo`), ma un
 * abbonamento finisce sempre a fine mese: il confine utile non è il 14 agosto,
 * è **il 31 agosto** dell'anno che chiude la stagione. Con il confine a metà
 * mese nessun annuale sarebbe mai acquistabile, nemmeno partendo a settembre,
 * perché finirebbe sempre due settimane oltre.
 */
export function ultimoGiornoStagione(annoSportivo: string): string | null {
  const annoChiusura = Number(annoSportivo?.split('/')[1])
  if (!Number.isInteger(annoChiusura)) return null
  return `${annoChiusura}-08-31`
}

/**
 * Quali decorrenze sono ancora possibili, per questa durata e questa stagione.
 *
 * Un abbonamento non può sfociare nella stagione successiva: chi compra un
 * annuale in ottobre arriverebbe a settembre dell'anno dopo, che è già l'altra
 * stagione, con un tesseramento che non copre quei mesi. Man mano che la
 * stagione avanza le durate lunghe si spengono da sole: a settembre l'annuale
 * si può ancora prendere partendo subito ma non dal mese dopo, da ottobre non
 * si può più prendere affatto.
 *
 * Le date si confrontano come stringhe ISO, che per 'AAAA-MM-GG' ordina come
 * il calendario.
 */
export function decorrenzeAmmesse(
  durataMesi: number,
  annoSportivo: string,
  adesso: Date = new Date()
): Record<InizioScelto, boolean> {
  const limite = ultimoGiornoStagione(annoSportivo)
  if (!limite) return { mese_corrente: true, mese_successivo: true }

  const entro = (inizio: InizioScelto) => {
    const p = periodoAbbonamento(inizio, durataMesi, adesso)
    // Senza durata non c'è un periodo da confinare: non è questo il controllo
    // che deve fermare le attività a ingressi.
    if (!p) return true
    return p.dataFine <= limite
  }

  return { mese_corrente: entro('mese_corrente'), mese_successivo: entro('mese_successivo') }
}

/** Se nessuna delle due decorrenze sta nella stagione, l'attività non è acquistabile. */
export function acquistabile(
  durataMesi: number,
  annoSportivo: string,
  adesso: Date = new Date()
): boolean {
  const a = decorrenzeAmmesse(durataMesi, annoSportivo, adesso)
  return a.mese_corrente || a.mese_successivo
}
