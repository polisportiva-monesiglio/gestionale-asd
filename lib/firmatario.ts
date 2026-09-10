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

/** Nessuno arriva a centoventi. Oltre, e' un errore di battitura sull'anno. */
const ETA_MASSIMA_PLAUSIBILE = 120

/**
 * Se una data di nascita puo' appartenere a una persona viva.
 *
 * Nasce da un caso vero dell'8 settembre 2026: un socio ha digitato 2026
 * invece di 2006 sull'anno, e nessuno l'ha fermato. Il guaio non e' stato il
 * refuso — e' quello che il refuso ha innescato. `eMinorenne` su una data
 * futura risponde di si', quindi il modulo gli ha chiesto i dati del genitore,
 * lui ha messo i propri, e ha firmato **come genitore di se stesso**. Il
 * modulo firmato, che e' il documento che vale, dice che e' minorenne.
 *
 * Un refuso su una cifra non deve poter cambiare chi ha diritto di firmare.
 */
export function dataNascitaPlausibile(
  valore: unknown,
  riferimento: Date = new Date()
): { ok: true } | { ok: false; motivo: string } {
  if (typeof valore !== 'string' || valore.trim() === '') {
    return { ok: false, motivo: 'La data di nascita e’ obbligatoria.' }
  }

  const nascita = new Date(valore)
  if (Number.isNaN(nascita.getTime())) {
    return { ok: false, motivo: 'La data di nascita non e’ una data valida.' }
  }

  // Confronto sul calendario italiano, come `eMinorenne`: chi nasce oggi non
  // deve risultare "nel futuro" per via del fuso del server.
  const n = partiRomane(nascita)
  const r = partiRomane(riferimento)

  const comeNumero = (d: { anno: number; mese: number; giorno: number }) =>
    d.anno * 10000 + d.mese * 100 + d.giorno

  if (comeNumero(n) > comeNumero(r)) {
    return { ok: false, motivo: 'La data di nascita e’ nel futuro: controlla l’anno.' }
  }

  if (r.anno - n.anno > ETA_MASSIMA_PLAUSIBILE) {
    return { ok: false, motivo: 'La data di nascita non sembra corretta: controlla l’anno.' }
  }

  return { ok: true }
}

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
