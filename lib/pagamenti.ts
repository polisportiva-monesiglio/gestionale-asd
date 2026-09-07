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
