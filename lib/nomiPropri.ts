/**
 * Nomi, luoghi e indirizzi scritti sempre nello stesso modo.
 *
 * Chi compila il modulo scrive come gli viene: "SAVONA", "mondovi", "Agata
 * elena". Finche' resta cosi', la stessa persona appare in tre modi diversi
 * sulla ricevuta, sul modulo firmato e sul foglio UISP, e chi cerca un socio
 * per cognome non lo trova. Si normalizza **alla scrittura** e non solo nel
 * foglio UISP, altrimenti le quattro rese continuano a dire cose diverse.
 *
 * Il codice fiscale e le sigle di provincia restano maiuscoli: li' la maiuscola
 * e' la forma giusta, non una svista di chi digita.
 */

/** Maiuscola dopo l'inizio, dopo uno spazio, un trattino o un apostrofo. */
function maiuscoleDiParola(testo: string): string {
  return testo
    .toLocaleLowerCase('it')
    .replace(/(^|[\s'\u2019-])([\p{L}])/gu, (_, prima, lettera: string) =>
      prima + lettera.toLocaleUpperCase('it')
    )
}

/**
 * Nome, cognome, luogo di nascita, citta'. Niente eccezioni: in un nome di
 * persona un numero romano non compare mai, e una particella come "De" o "Di"
 * va scritta con l'iniziale maiuscola come tutto il resto.
 */
export function nomeProprio(valore: string | null | undefined): string {
  const testo = (valore ?? '').trim().replace(/\s+/g, ' ')
  if (!testo) return ''
  return maiuscoleDiParola(testo)
}

/** Numero romano scritto per intero, nella forma canonica. */
const NUMERO_ROMANO = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/

/**
 * Parole che sono anche numeri romani validi ma qui non lo sono mai: "di",
 * "li", "mi", "ci", "vi". Senza questo elenco "VIA DI MEZZO" terrebbe "DI"
 * maiuscolo perche' vale 501.
 */
const NON_SONO_NUMERI = new Set(['DI', 'LI', 'MI', 'CI', 'VI'])

function eUnNumeroRomano(pezzo: string): boolean {
  const nudo = pezzo.replace(/[^\p{L}]/gu, '')
  if (nudo.length < 2) return false
  // Solo se chi ha scritto lo aveva gia' in maiuscolo: "xx settembre" scritto
  // minuscolo e' piu' probabilmente una svista che un numero romano.
  if (nudo !== nudo.toUpperCase()) return false
  if (NON_SONO_NUMERI.has(nudo)) return false
  return NUMERO_ROMANO.test(nudo)
}

/**
 * L'indirizzo ha due eccezioni che il nome di persona non ha, e sono state
 * trovate provando la normalizzazione sui dati veri il 4 settembre 2026:
 *
 * - **i pezzi con dentro una cifra si lasciano stare.** "Via Trento Trieste
 *   14/b" sarebbe diventato "14/B": il civico e' come lo ha scritto il socio e
 *   come sta sul campanello, non e' una parola da correggere.
 * - **i numeri romani gia' maiuscoli restano maiuscoli.** "Piazza XX
 *   Settembre" sarebbe diventato "Piazza Xx Settembre", che non e' un indirizzo.
 */
export function indirizzoNormalizzato(valore: string | null | undefined): string {
  const testo = (valore ?? '').trim().replace(/\s+/g, ' ')
  if (!testo) return ''

  return testo
    .split(' ')
    .map((pezzo) => {
      if (/\d/.test(pezzo)) return pezzo
      if (eUnNumeroRomano(pezzo)) return pezzo
      return maiuscoleDiParola(pezzo)
    })
    .join(' ')
}
