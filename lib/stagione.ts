import { partiRomane } from './dataRoma'

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
