import { partiRomane } from './dataRoma'

/**
 * Chi firma il modulo, e a quale indirizzo va spedito il codice.
 *
 * Vive in un modulo solo perche' la stessa domanda se la pongono due rotte
 * diverse: /api/invia-otp per sapere dove spedire, /api/iscrizione per sapere
 * contro quale indirizzo verificare. Finche' rispondevano ognuna per conto
 * proprio, rispondevano diverso: l'una spediva al genitore, l'altra
 * verificava sull'email del ragazzo, e la firma di ogni minorenne il cui
 * genitore avesse indicato un'email veniva rifiutata con "Token non valido".
 *
 * Il calcolo lo fa il server. Se lo facesse il browser, basterebbe dichiarare
 * una data di nascita diversa per spostare il codice dove si preferisce.
 */

export function eMinorenne(dataNascita: unknown, riferimento: Date = new Date()): boolean {
  if (typeof dataNascita !== 'string') return false
  const nascita = new Date(dataNascita)
  if (Number.isNaN(nascita.getTime())) return false

  // Data di nascita e riferimento letti entrambi in ora italiana: il compleanno
  // di chi compie 18 anni scatta a mezzanotte a Monesiglio, non a Greenwich.
  const n = partiRomane(nascita)
  const r = partiRomane(riferimento)

  let eta = r.anno - n.anno
  if (r.mese < n.mese || (r.mese === n.mese && r.giorno < n.giorno)) eta--
  return eta < 18
}

export type Firmatario = {
  /** Indirizzo a cui spedire il codice e contro cui verificarlo. Null se i dati non bastano. */
  email: string | null
  minorenne: boolean
  nome: string | null
  cognome: string | null
}

export function firmatarioDi(
  dati: Record<string, unknown>,
  riferimento: Date = new Date()
): Firmatario {
  const testo = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s.length > 0 ? s : null
  }

  if (eMinorenne(dati?.dataNascita, riferimento)) {
    // Per un minore il modulo lo sottoscrive chi esercita la responsabilita'
    // genitoriale: il codice deve arrivare a lui, non al ragazzo.
    return {
      email: testo(dati?.genitoreEmail),
      minorenne: true,
      nome: testo(dati?.genitoreNome),
      cognome: testo(dati?.genitoreCognome),
    }
  }

  return {
    email: testo(dati?.email),
    minorenne: false,
    nome: testo(dati?.nome),
    cognome: testo(dati?.cognome),
  }
}
