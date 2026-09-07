import { giorniAllaScadenza } from '@/lib/analisi'

/**
 * I filtri della lista soci.
 *
 * Regola portante: **si filtra per quello che c'è scritto nella pastiglia.**
 * Chi vede «Scaduto» e sceglie «Scaduto» deve ritrovare esattamente quelle
 * righe. Per questo la classificazione del certificato sta qui e non dentro il
 * componente: `badgeScadenza` la usa per decidere cosa scrivere e il filtro la
 * usa per decidere cosa tenere, quindi non possono divergere. Erano due conti
 * separati sullo stesso dato — il modo classico in cui una tabella comincia a
 * mentire dopo qualche mese.
 */

export type StatoCertificato = 'mancante' | 'scaduto' | 'in_scadenza' | 'valido'
export type StatoFrequenza = 'pagato' | 'da_saldare' | 'nessuno'

/** Entro quanti giorni un certificato è «in scadenza» e non più «valido». */
export const GIORNI_IN_SCADENZA = 30

export type SocioFiltrabile = {
  nome: string
  cognome: string
  email: string | null
  telefono: string | null
  dataRegistrazione: string | null
  scadenzaCert: string | null
  statoAbbonamento: string | null
}

export function statoCertificato(scadenza: string | null, oggi: Date = new Date()): StatoCertificato {
  if (!scadenza) return 'mancante'
  const giorni = giorniAllaScadenza(scadenza, oggi)
  if (Number.isNaN(giorni)) return 'mancante'
  if (giorni < 0) return 'scaduto'
  if (giorni <= GIORNI_IN_SCADENZA) return 'in_scadenza'
  return 'valido'
}

export function statoFrequenza(stato: string | null): StatoFrequenza {
  if (stato === 'pagato') return 'pagato'
  if (stato === 'da_saldare') return 'da_saldare'
  return 'nessuno'
}

export type Filtri = {
  /** La ricerca in alto: guarda nome, email e telefono insieme. */
  ovunque: string
  socio: string
  email: string
  telefono: string
  frequenza: StatoFrequenza | ''
  certificato: StatoCertificato | ''
  /** Giorni: '7', '30', '90'. Vuoto = da sempre. */
  iscritto: string
}

export const FILTRI_VUOTI: Filtri = {
  ovunque: '',
  socio: '',
  email: '',
  telefono: '',
  frequenza: '',
  certificato: '',
  iscritto: '',
}

/** Quanti filtri sono accesi. Serve a dirlo sul pulsante, così non si resta
 *  con una lista corta senza capire perché. */
export function quantiFiltriAttivi(f: Filtri): number {
  return Object.values(f).filter(v => v.trim() !== '').length
}

function contiene(valore: string | null | undefined, cerca: string): boolean {
  const c = cerca.trim().toLocaleLowerCase('it')
  if (!c) return true
  return (valore ?? '').toLocaleLowerCase('it').includes(c)
}

export function filtraSoci<T extends SocioFiltrabile>(
  soci: T[],
  f: Filtri,
  oggi: Date = new Date()
): T[] {
  return soci.filter(s => {
    if (!contiene(`${s.nome} ${s.cognome} ${s.email ?? ''} ${s.telefono ?? ''}`, f.ovunque)) return false

    // Il cognome prima del nome, come si legge nella tabella: chi cerca
    // "rossi m" deve trovare Rossi Mario.
    if (!contiene(`${s.cognome} ${s.nome}`, f.socio)) return false
    if (!contiene(s.email, f.email)) return false

    // Sul telefono si confrontano solo le cifre da tutte e due le parti: un
    // numero salvato "+39 340 1986561" non si trova cercando "3401986561", che
    // è esattamente come uno lo cerca leggendolo da un messaggio.
    if (f.telefono.trim() !== '') {
      const cifreCercate = f.telefono.replace(/\D/g, '')
      const cifreSocio = (s.telefono ?? '').replace(/\D/g, '')
      if (cifreCercate !== '' && !cifreSocio.includes(cifreCercate)) return false
    }

    if (f.frequenza !== '' && statoFrequenza(s.statoAbbonamento) !== f.frequenza) return false
    if (f.certificato !== '' && statoCertificato(s.scadenzaCert, oggi) !== f.certificato) return false

    if (f.iscritto !== '') {
      if (!s.dataRegistrazione) return false
      const quanti = Number(f.iscritto)
      const giorniFa = -giorniAllaScadenza(s.dataRegistrazione.slice(0, 10), oggi)
      // `giorniFa` è negativo per una data futura: la escludiamo, se no
      // un'iscrizione con la data sbagliata comparirebbe in ogni finestra.
      if (Number.isNaN(giorniFa) || giorniFa < 0 || giorniFa > quanti) return false
    }

    return true
  })
}

/** Le voci dei due elenchi a tendina, scritte come le pastiglie in tabella. */
export const VOCI_FREQUENZA: { valore: StatoFrequenza; testo: string }[] = [
  { valore: 'da_saldare', testo: 'Da saldare' },
  { valore: 'pagato', testo: 'Pagato' },
  { valore: 'nessuno', testo: 'Nessuno' },
]

export const VOCI_CERTIFICATO: { valore: StatoCertificato; testo: string }[] = [
  { valore: 'mancante', testo: 'Mancante' },
  { valore: 'scaduto', testo: 'Scaduto' },
  { valore: 'in_scadenza', testo: `In scadenza (entro ${GIORNI_IN_SCADENZA}g)` },
  { valore: 'valido', testo: 'Valido' },
]

export const VOCI_ISCRITTO: { valore: string; testo: string }[] = [
  { valore: '7', testo: 'Ultimi 7 giorni' },
  { valore: '30', testo: 'Ultimi 30 giorni' },
  { valore: '90', testo: 'Ultimi 90 giorni' },
]
