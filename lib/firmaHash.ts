import crypto from 'crypto'

// Campi che costituiscono il contenuto effettivamente "dichiarato e firmato"
// (dati anagrafici + consensi). Se uno di questi cambia tra la richiesta
// dell'OTP e la conferma della firma, l'hash non corrisponde più e la
// firma viene rifiutata: l'OTP autentica così il contenuto, non solo l'email.
const CAMPI_DATI_FIRMA = [
  'nome', 'cognome', 'sesso', 'dataNascita', 'luogoNascita', 'provinciaNascita',
  'cittadinanza', 'codiceFiscale', 'indirizzoResidenza', 'cittaResidenza',
  'capResidenza', 'provinciaResidenza', 'email', 'telefono',
  'genitoreNome', 'genitoreCognome', 'genitoreContattoScelta', 'genitoreContatto',
  'consensoSalute', 'consensoRegolamento', 'consensoVideosorveglianza',
  'consensoInformativaPrivacy', 'consensoPrivacy',
] as const

export function hashDatiFirma(dati: Record<string, unknown>): string {
  const valori = CAMPI_DATI_FIRMA.map(campo => `${campo}=${String(dati?.[campo] ?? '')}`)
  return crypto.createHash('sha256').update(valori.join('|')).digest('hex')
}
