import { chiaveAmbito } from '@/lib/abbonamento'
import { giorniAllaScadenza } from '@/lib/analisi'

/**
 * Quando a un socio finisce la frequenza, e se va richiamato.
 *
 * Nato il 10 novembre 2026: l'email automatica cinque giorni prima non basta,
 * molti non la leggono, e dal gestionale non si capiva **di chi** fosse il
 * turno. La Dashboard mostrava ogni periodo pagato in scadenza entro 30
 * giorni — con i mensili vuol dire tutti, compresi quelli che avevano già
 * rinnovato — e un periodo appena finito spariva il giorno dopo, proprio
 * quando c'era da telefonare.
 *
 * Qui si guarda **l'ultimo giorno pagato per socio e per ambito** (la sala
 * pesi è una sola qualunque durata, ogni corso è a sé: vedi `chiaveAmbito`).
 * Chi ha già rinnovato ha un ultimo giorno più avanti e non compare.
 */

/** Entro quanti giorni dalla fine una frequenza è «in scadenza». L'email parte a 5. */
export const GIORNI_FREQUENZA_IN_SCADENZA = 7

/**
 * Per quanti giorni una frequenza finita e non rinnovata resta da richiamare.
 * Oltre, chi non ha rinnovato ha smesso di venire o ha già deciso: un
 * elenco che si allunga per sempre smette di essere letto.
 */
export const GIORNI_SCADUTA_DA_RICHIAMARE = 30

export type StatoCopertura = 'attiva' | 'in_scadenza' | 'scaduta'

export function statoCopertura(fine: string, oggi: Date = new Date()): { stato: StatoCopertura; giorni: number } {
  const giorni = giorniAllaScadenza(fine, oggi)
  if (giorni < 0) return { stato: 'scaduta', giorni }
  if (giorni <= GIORNI_FREQUENZA_IN_SCADENZA) return { stato: 'in_scadenza', giorni }
  return { stato: 'attiva', giorni }
}

export type PeriodoDelSocio = {
  socioId: string
  attivitaId: string | null
  tipo: string | null
  fine: string | null
}

/**
 * Per ogni socio e ambito, il periodo pagato che finisce più tardi.
 * I periodi senza data di fine (pacchetti a ingressi) non hanno una scadenza
 * da guardare e restano fuori.
 */
export function ultimiPeriodi<T extends PeriodoDelSocio>(pagati: readonly T[]): T[] {
  const ultimi = new Map<string, T>()
  for (const p of pagati) {
    if (!p.fine) continue
    const chiave = `${p.socioId}|${chiaveAmbito(p.attivitaId, p.tipo)}`
    const prima = ultimi.get(chiave)
    if (!prima || (p.fine > (prima.fine as string))) ultimi.set(chiave, p)
  }
  return [...ultimi.values()]
}

/** Come si dice a schermo: «Scade oggi», «Fra 3 giorni», «Scaduta da 2 giorni». */
export function quandoScade(giorni: number): string {
  if (giorni === 0) return 'Scade oggi'
  if (giorni === 1) return 'Scade domani'
  if (giorni > 1) return `Fra ${giorni} giorni`
  if (giorni === -1) return 'Scaduta ieri'
  return `Scaduta da ${-giorni} giorni`
}
