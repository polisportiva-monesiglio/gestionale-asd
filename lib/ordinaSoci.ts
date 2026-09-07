/**
 * L'ordinamento della lista soci, staccato dalla tabella che lo mostra.
 *
 * Sta qui e non dentro il componente per una ragione pratica: le regole sotto
 * hanno due eccezioni volute e una sottigliezza sulla stabilità, e dentro un
 * file di JSX nessuna delle tre si può provare senza aprire un browser.
 */

export type SocioOrdinabile = {
  nome: string
  cognome: string
  email: string | null
  telefono: string | null
  dataRegistrazione: string | null
  scadenzaCert: string | null
  statoAbbonamento: string | null
}

export type Colonna = 'socio' | 'frequenza' | 'certificato' | 'iscritto' | 'email' | 'telefono'
export type Verso = 'su' | 'giu'

/**
 * Il valore su cui si ordina una colonna.
 *
 * `null` vuol dire "dato mancante" e finisce **sempre in fondo**, in tutti e
 * due i versi: chi non ha un numero di telefono non è il primo della lista né
 * l'ultimo, è semplicemente uno di cui non si sa. Farlo galleggiare in cima
 * invertendo l'ordine è il modo più rapido di far sembrare rotta una tabella.
 *
 * Due colonne fanno eccezione di proposito, e sono le due che si guardano per
 * sapere cosa c'è da fare: certificato e frequenza non si ordinano per valore
 * ma **per urgenza**.
 */
export function chiaveDi(s: SocioOrdinabile, colonna: Colonna): string | number | null {
  switch (colonna) {
    case 'socio':
      return `${s.cognome} ${s.nome}`.trim().toLocaleLowerCase('it')

    case 'email':
      return s.email?.trim().toLocaleLowerCase('it') || null

    case 'telefono':
      // Solo le cifre: se no un numero scritto "+39 340…" e uno scritto
      // "0173…" si ordinano per il segno davanti invece che per il numero.
      return s.telefono ? s.telefono.replace(/\D/g, '') || null : null

    case 'iscritto': {
      if (!s.dataRegistrazione) return null
      const t = new Date(s.dataRegistrazione).getTime()
      // Una data che il browser non sa leggere non è una data: vale come
      // mancante, invece di diventare un `NaN` che si porta dietro
      // l'ordinamento di tutta la colonna.
      return Number.isNaN(t) ? null : t
    }

    case 'certificato': {
      // In su = dal più urgente. Un certificato **mancante** è più urgente di
      // uno scaduto, che è più urgente di uno che scade fra un mese: qui il
      // dato mancante viene per primo e non per ultimo. È l'unica colonna in
      // cui un buco è un'informazione invece che un'assenza — un socio senza
      // certificato in palestra non ci può entrare.
      if (!s.scadenzaCert) return Number.NEGATIVE_INFINITY
      const t = new Date(s.scadenzaCert).getTime()
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
    }

    case 'frequenza':
      // In su = da sistemare per primo. Non alfabetico: "Da saldare" verrebbe
      // prima di "Pagato" per puro caso, e "Nessuno" finirebbe fra i due
      // invece che in fondo.
      if (s.statoAbbonamento === 'da_saldare') return 0
      if (s.statoAbbonamento === 'pagato') return 1
      return 2
  }
}

function perCognome(a: SocioOrdinabile, b: SocioOrdinabile): number {
  return `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it')
}

export function confronta(
  a: SocioOrdinabile,
  b: SocioOrdinabile,
  colonna: Colonna,
  verso: Verso
): number {
  const va = chiaveDi(a, colonna)
  const vb = chiaveDi(b, colonna)

  // I mancanti restano in fondo anche invertendo il verso: il segno qui non
  // viene girato apposta.
  if (va === null && vb === null) return perCognome(a, b)
  if (va === null) return 1
  if (vb === null) return -1

  const esito =
    typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : // `localeCompare` con l'italiano, se no "Tarò" finisce dopo
        // "Torterolo" invece che prima.
        String(va).localeCompare(String(vb), 'it')

  // A parità si ordina per cognome, e **prima** di girare il verso: senza
  // questo due soci iscritti lo stesso giorno si scambiano di posto a ogni
  // ridisegno e la tabella sembra muoversi da sola.
  if (esito === 0) return perCognome(a, b)

  return verso === 'su' ? esito : -esito
}

export function ordinaSoci<T extends SocioOrdinabile>(
  soci: T[],
  colonna: Colonna,
  verso: Verso
): T[] {
  return [...soci].sort((a, b) => confronta(a, b, colonna, verso))
}
