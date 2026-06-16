export function getAnnoSportivo(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 1-12
  const day = date.getDate()
  // Da metà agosto la nuova stagione è già quella "corrente" per le iscrizioni
  const isNuovaStagione = month > 8 || (month === 8 && day >= 15)
  if (isNuovaStagione) {
    return `${year}/${year + 1}`
  }
  return `${year - 1}/${year}`
}
