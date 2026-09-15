/**
 * I modi in cui si paga, in un posto solo.
 *
 * Stavano scritti in tre punti che non si parlavano: i bottoni nel modulo del
 * socio, l'elenco delle etichette nell'area gestori, e il vincolo `CHECK` in
 * tabella. Il server non controllava niente: `metodo_pagamento` arrivava dal
 * modulo e finiva in tabella cosi' com'era, quindi togliere un bottone
 * nascondeva la scelta a chi usa il sito ma non a chi manda la richiesta a
 * mano.
 */

/** Le scelte offerte oggi, nell'ordine in cui compaiono nel modulo. */
export const METODI_PAGAMENTO = [
  { valore: 'contanti', etichetta: 'Contanti' },
  { valore: 'satispay', etichetta: 'Satispay' },
  { valore: 'bonifico', etichetta: 'Bonifico' },
] as const

export type MetodoPagamento = (typeof METODI_PAGAMENTO)[number]['valore']

/**
 * Anche i metodi che **non si scelgono piu'** ma che qualcuno ha gia' usato.
 *
 * "Carta" e' stata tolta dalle scelte il 7 settembre 2026, ma tre abbonamenti
 * la portano gia' scritta e uno di quelli ha la ricevuta `RIC-2026-0011` gia'
 * emessa. Toglierla anche da qui farebbe comparire `carta` in minuscolo al
 * posto di "Carta" su una ricevuta vera: quello che non si accetta piu' e' una
 * richiesta *nuova*, non la storia di chi ha gia' pagato.
 *
 * Per lo stesso motivo il vincolo `CHECK` in tabella continua ad ammettere
 * 'carta': restringerlo renderebbe quelle tre righe impossibili da riscrivere.
 */
const ETICHETTE_STORICHE: Record<string, string> = {
  carta: 'Carta',
}

const ETICHETTE: Record<string, string> = {
  ...Object.fromEntries(METODI_PAGAMENTO.map((m) => [m.valore, m.etichetta])),
  ...ETICHETTE_STORICHE,
}

/** Come si scrive un metodo di pagamento, anche uno non piu' offerto. */
export function etichettaMetodo(metodo: string | null | undefined): string {
  if (!metodo) return '\u2014'
  return ETICHETTE[metodo] ?? metodo
}

/** Vero solo per i metodi che una richiesta nuova puo' ancora usare. */
export function metodoAccettabile(metodo: string): boolean {
  return METODI_PAGAMENTO.some((m) => m.valore === metodo)
}

/* ------------------------------------------------------------------ */
/* Dove si paga                                                        */
/* ------------------------------------------------------------------ */

/**
 * L'intestatario da scrivere nel bonifico.
 *
 * E' lo stesso nome stampato sulle ricevute. ⚠️ Deve coincidere con
 * l'intestazione del conto in banca: dal 2025 le banche confrontano nome e
 * IBAN prima di eseguire il bonifico (verifica del beneficiario), e se non
 * combaciano avvisano chi paga — che a quel punto si ferma e telefona.
 */
export const INTESTATARIO_CONTO = 'ASD Polisportiva Monesiglio'

/**
 * L'IBAN del conto dell'associazione.
 *
 * Verificato il 15 settembre 2026 col controllo mod 97 (resto 1, come deve):
 * un refuso qui manderebbe i soldi di tutti i soci nel posto sbagliato, o
 * piu' probabilmente in nessun posto dopo una settimana di attesa.
 */
export const IBAN = 'IT98U0306946766100000000343'

/** L'IBAN a gruppi di quattro, per leggerlo. Si copia sempre senza spazi. */
export function ibanLeggibile(iban: string = IBAN): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

/** Il limite dei caratteri della causale in un bonifico SEPA. */
const LUNGHEZZA_MASSIMA_CAUSALE = 140

/**
 * La causale del bonifico, gia' compilata.
 *
 * Esiste per chi deve riconoscere il pagamento: dall'estratto conto un
 * bonifico con causale "abbonamento" non dice di chi e', e con trenta soci
 * che pagano tutti il mese uguale diventa un indovinello.
 *
 * Solo lettere senza accento, cifre e pochi segni: e' l'insieme che il
 * circuito SEPA garantisce di trasportare intatto. "Taro'" non si perde, ma
 * una "ò" puo' arrivare in banca come un punto interrogativo — o far
 * rifiutare il bonifico dall'app di chi paga.
 */
export function causaleBonifico(dati: {
  nomeSocio: string
  attivita: string
  annoSportivo: string
}): string {
  const grezza = `${dati.nomeSocio} - ${dati.attivita} ${dati.annoSportivo}`
  return grezza
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LUNGHEZZA_MASSIMA_CAUSALE)
}

/**
 * Il negozio Satispay dell'associazione.
 *
 * La documentazione pubblica di Satispay non dice come passare l'importo in un
 * link, e la prima versione di questo codice partiva dall'idea che non si
 * potesse: un link creato a mano per ogni cifra. I link veri generati
 * dall'app il 15 settembre 2026 hanno invece tutti la stessa forma — il
 * negozio piu' `?amount=` in **centesimi** — quindi l'importo lo scrive il
 * sito, e il giorno che cambia il listino non c'e' niente da rifare.
 *
 * ⚠️ Il formato e' quello che produce l'app, non uno documentato: se un giorno
 * Satispay lo cambia, i link smettono di aprire l'importo giusto. Quando e'
 * stato scritto, i link generati qui coincidevano al carattere con gli otto
 * prodotti dall'app (25, 70, 130, 220, 45, 90, 150, 240 euro).
 *
 * `null` = nessun negozio: il modulo dice di pagare Satispay a un consigliere
 * invece di mostrare un bottone che non porta da nessuna parte.
 */
export const ID_NEGOZIO_SATISPAY: string | null = '97af4101-0d80-457e-a555-b07b76dfa40a'

export function linkSatispay(
  importo: number,
  idNegozio: string | null = ID_NEGOZIO_SATISPAY
): { link: string; importoGiaDentro: boolean } | null {
  if (!idNegozio) return null
  // Si arrotonda ai centesimi: 45 non deve diventare 4499,999... per un
  // errore di virgola mobile, e Satispay vuole un intero.
  const centesimi = Math.round(importo * 100)
  if (!Number.isFinite(centesimi) || centesimi <= 0) return null
  return {
    link: `https://www.satispay.com/app/pay/shops/${encodeURIComponent(idNegozio)}?amount=${centesimi}`,
    importoGiaDentro: true,
  }
}
