// Fuso in cui vive l'Associazione. Una data di calendario esiste solo dentro
// un fuso: il server esegue in UTC, quindi senza fissarlo qui il 15 agosto
// comincia due ore piu' tardi di quanto comincia a Monesiglio.
export const FUSO = 'Europe/Rome'

/** Giorno, mese e anno come li vede chi sta a Monesiglio, non come li vede il server. */
export function partiRomane(date: Date): { anno: number; mese: number; giorno: number } {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const valore = (tipo: string) => Number(parti.find(p => p.type === tipo)?.value)
  return { anno: valore('year'), mese: valore('month'), giorno: valore('day') }
}
