/**
 * Il carattere di controllo del codice fiscale.
 *
 * Serve perché la sola forma non basta. Il 2 settembre 2026 una persona si è
 * iscritta due volte: la prima richiesta era andata a buon fine ma la risposta
 * non le è tornata indietro, al secondo tentativo si è vista dire «codice
 * fiscale già registrato», e ha cambiato l'ultima lettera per farlo passare.
 * È passato: il controllo guardava solo che le lettere fossero al posto delle
 * lettere e le cifre al posto delle cifre. Due righe in `soci`, due
 * tesseramenti, due quote UISP, e la stessa persona contata due volte
 * nell'elenco per la UISP.
 *
 * Il carattere finale è calcolato dai quindici precedenti: cambiarne uno solo
 * rende il codice invalido, e questo lo intercetta.
 *
 * L'omocodia è gestita senza doverla trattare a parte: quando due persone
 * collidono, l'Agenzia delle Entrate sostituisce alcune cifre con lettere
 * (L M N P Q R S T U V), e il carattere di controllo viene ricalcolato sul
 * codice così com'è scritto. Il conto qui sotto lavora sui caratteri effettivi,
 * quindi un codice omocodico valido resta valido.
 */

// Valore di ogni carattere quando si trova in posizione dispari (1ª, 3ª, …).
const DISPARI: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}

// In posizione pari il valore è la posizione nell'alfabeto, e le cifre valgono se stesse.
function valorePari(c: string): number {
  return c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65
}

/** La forma: sei lettere, poi le coppie anno/mese/giorno, il comune, e il controllo. */
export const FORMA_CODICE_FISCALE =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/

/** Il carattere di controllo che spetta ai primi quindici caratteri. */
export function carattereDiControllo(primi15: string): string | null {
  if (primi15.length !== 15) return null

  let somma = 0
  for (let i = 0; i < 15; i++) {
    const c = primi15[i]
    // i è 0-based, quindi le posizioni dispari (1ª, 3ª…) hanno i pari.
    const valore = i % 2 === 0 ? DISPARI[c] : valorePari(c)
    if (valore === undefined || Number.isNaN(valore)) return null
    somma += valore
  }

  return String.fromCharCode(65 + (somma % 26))
}

/** Vero se il codice ha la forma giusta *e* il carattere di controllo giusto. */
export function codiceFiscaleValido(valore: unknown): boolean {
  if (typeof valore !== 'string') return false
  const cf = valore.trim().toUpperCase()
  if (!FORMA_CODICE_FISCALE.test(cf)) return false
  return carattereDiControllo(cf.slice(0, 15)) === cf[15]
}
