/**
 * Che cosa è davvero il file di un certificato medico.
 *
 * Non ci si fida del tipo dichiarato dal browser: è scelto dal client, e certe
 * app di messaggistica mandano allegati senza estensione o con un tipo
 * sbagliato. Si guardano i primi byte, come già faceva il controllo `%PDF` che
 * questa funzione sostituisce — allargandolo alle foto, perché **il
 * certificato quasi sempre si fotografa col telefono**: pretendere un PDF
 * significa mandare la persona a cercare un'app che lo converta.
 *
 * I tipi ammessi sono gli stessi dell'archivio `certificati-medici`
 * (application/pdf, image/jpeg, image/png, image/webp, image/heic): se qui si
 * aggiunge qualcosa che lì non c'è, il caricamento viene rifiutato dallo
 * Storage con un errore che dalla pagina non si capisce.
 */

export type TipoCertificato = { estensione: string; mime: string }

const dice = (b: Uint8Array, inizio: number, testo: string) =>
  testo.split('').every((c, i) => b[inizio + i] === c.charCodeAt(0))

export function riconosciCertificato(byte: Uint8Array): TipoCertificato | null {
  if (dice(byte, 0, '%PDF')) return { estensione: 'pdf', mime: 'application/pdf' }
  if (byte[0] === 0xff && byte[1] === 0xd8 && byte[2] === 0xff) return { estensione: 'jpg', mime: 'image/jpeg' }
  if (byte[0] === 0x89 && dice(byte, 1, 'PNG')) return { estensione: 'png', mime: 'image/png' }
  if (dice(byte, 0, 'RIFF') && dice(byte, 8, 'WEBP')) return { estensione: 'webp', mime: 'image/webp' }
  // HEIC/HEIF: la sigla non è all'inizio, sta nel primo box, dopo i quattro
  // byte della sua lunghezza. È il formato predefinito delle foto su iPhone.
  if (dice(byte, 4, 'ftyp')) return { estensione: 'heic', mime: 'image/heic' }
  return null
}

/** Quanto può pesare: è il limite dell'archivio, e una foto pesa più di un PDF. */
export const MAX_CERTIFICATO = 10 * 1024 * 1024

export const CERTIFICATO_ACCETTATI = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*'
