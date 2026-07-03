// Normalizza un numero di telefono nel formato internazionale E.164
// richiesto da Twilio WhatsApp (es. "347 698 6347" → "+393476986347").
// Ritorna null se l'input è vuoto o non è un numero valido.
export function normalizzaTelefono(input: string | null | undefined): string | null {
  if (!input) return null
  let t = input.replace(/[\s\-().\/]/g, '')
  if (!t) return null
  if (t.startsWith('00')) t = '+' + t.slice(2)
  if (!t.startsWith('+')) t = '+39' + t
  return /^\+\d{8,15}$/.test(t) ? t : null
}
