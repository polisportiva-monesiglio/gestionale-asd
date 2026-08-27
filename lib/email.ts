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
