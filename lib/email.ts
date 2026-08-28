/**
 * Dice se una stringa ha la forma di un indirizzo email.
 *
 * Non pretende di validare ogni indirizzo esistente - non si puo', e provarci
 * produce espressioni regolari che rifiutano indirizzi legittimi. Serve a
 * fermare le stringhe che email non sono, prima che arrivino a Resend o
 * finiscano in tabella come recapito di un gestore che non potra' mai
 * accedere.
 *
 * Vive qui perche' lo stesso controllo serviva in tre punti diversi, e due
 * copie su tre erano gia' divergenti.
 */
export function emailPlausibile(valore: unknown): valore is string {
  if (typeof valore !== 'string') return false
  const v = valore.trim()
  return v.length > 0 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

/**
 * Neutralizza una stringa destinata al corpo HTML di un'email.
 *
 * Nome, note e attivita' arrivano da moduli compilati da persone e finiscono
 * dentro messaggi spediti dal dominio verificato dell'ASD: senza questo, chi
 * scrive del markup al posto del proprio nome se lo vedrebbe interpretato.
 *
 * Sta qui accanto a emailPlausibile perche' il problema e' lo stesso: una
 * copia per ogni rotta che spedisce, e le copie divergono.
 */
export function testoSicuroHtml(valore: unknown): string {
  return String(valore ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
