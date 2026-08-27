// Fuso in cui vive l'Associazione. La stagione cambia a una data di calendario,
// e una data di calendario esiste solo dentro un fuso: il server esegue in UTC,
// quindi senza fissarlo qui un'iscrizione delle 01:30 del 15 agosto verrebbe
// letta come del 14 e finirebbe nella stagione precedente, gia' chiusa.
const FUSO = 'Europe/Rome'

/** Giorno, mese e anno come li vede chi sta a Monesiglio, non come li vede il server. */
function partiRomane(date: Date): { anno: number; mese: number; giorno: number } {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const valore = (tipo: string) => Number(parti.find(p => p.type === tipo)?.value)
  return { anno: valore('year'), mese: valore('month'), giorno: valore('day') }
}

export function getAnnoSportivo(date: Date = new Date()): string {
  const { anno, mese, giorno } = partiRomane(date)
  // Da meta' agosto la nuova stagione e' gia' quella "corrente" per le iscrizioni
  const isNuovaStagione = mese > 8 || (mese === 8 && giorno >= 15)
  if (isNuovaStagione) {
    return `${anno}/${anno + 1}`
  }
  return `${anno - 1}/${anno}`
}

export function getStagionePrecedente(stagione: string): string {
  const [primoAnno] = stagione.split('/')
  const anno = parseInt(primoAnno, 10) - 1
  return `${anno}/${anno + 1}`
}
