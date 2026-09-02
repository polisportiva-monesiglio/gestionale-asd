/**
 * Il "Modulo Richiesta Tesseramento" della UISP: le parti che servono anche al
 * browser.
 *
 * Il file vero lo compila `lib/uispServer.ts`, che apre il modello con exceljs
 * e non può finire in un componente client. Qui restano solo le costanti e le
 * trasformazioni pure, che la pagina dei gestori usa per dire quanti soci
 * entrano in un modulo.
 */

/**
 * Il modello arriva con 54 righe gia' bordate, dalla 10 alla 63. Non e' un
 * limite: quelle che avanzano si tolgono, e se i soci sono di piu' se ne
 * aggiungono. Il tetto serve solo a distinguere un invio grosso da un errore.
 */
export const PRIMA_RIGA = 10
export const ULTIMA_RIGA = 63
export const RIGHE_MODELLO = ULTIMA_RIGA - PRIMA_RIGA + 1
export const MASSIMO_RAGIONEVOLE = 500

/**
 * L'intestazione del modulo: chi firma la richiesta e per quale associazione.
 *
 * Non e' nel codice perche' cambia col presidente e col codice di
 * affiliazione: sta in `impostazioni` e la compilano i gestori. Se manca, il
 * campo resta bianco come nei moduli riempiti a mano finora.
 */
export type IntestazioneUisp = {
  presidenteCognome: string
  presidenteNome: string
  denominazione: string
  codiceAffiliazione: string
}

/** Le chiavi in `impostazioni` che tengono l'intestazione. */
export const CHIAVI_INTESTAZIONE = {
  presidenteCognome: 'uisp_presidente_cognome',
  presidenteNome: 'uisp_presidente_nome',
  denominazione: 'uisp_denominazione',
  codiceAffiliazione: 'uisp_codice_affiliazione',
} as const

export const INTESTAZIONE_VUOTA: IntestazioneUisp = {
  presidenteCognome: '',
  presidenteNome: '',
  denominazione: '',
  codiceAffiliazione: '',
}

export type RigaUisp = {
  cognome: string | null
  nome: string | null
  sesso: string | null
  dataNascita: string | null
  luogoNascita: string | null
  provinciaNascita: string | null
  cf: string | null
  indirizzo: string | null
  citta: string | null
  email: string | null
  telefono: string | null
}

/**
 * Il modulo tiene la via e il numero civico in due colonne, noi l'indirizzo in
 * un campo solo ("Via Roma 4"). Stacchiamo l'ultimo pezzo se somiglia a un
 * civico - cifre, eventualmente seguite da una lettera o da "/2" - altrimenti
 * lasciamo tutto nella via: "Localita' Italia" non ha un civico da estrarre, e
 * spezzarla a forza produrrebbe un indirizzo sbagliato.
 */
export function separaIndirizzo(indirizzo: string | null): { via: string; civico: string } {
  const testo = (indirizzo ?? '').trim()
  if (!testo) return { via: '', civico: '' }

  const match = testo.match(/^(.*?)[\s,]+(\d+\s*(?:[/-]\s*\w+)?|\d+[a-zA-Z])$/)
  if (!match || !match[1].trim()) return { via: testo, civico: '' }

  return { via: match[1].trim().replace(/,$/, ''), civico: match[2].replace(/\s+/g, '') }
}

/** Le date sul modulo sono testo in formato italiano, non date di Excel. */
export function formattaDataItaliana(iso: string | null): string {
  if (!iso) return ''
  const [anno, mese, giorno] = iso.slice(0, 10).split('-')
  return anno && mese && giorno ? `${giorno}/${mese}/${anno}` : ''
}

/** Il nome che i file hanno sempre avuto su Drive: "3 - Modulo ... 2026-2027.xlsx". */
export function nomeFileModulo(numero: number, annoSportivo: string, estensione: 'xlsx' | 'pdf' = 'xlsx'): string {
  return `${numero} - Modulo Richiesta Tesseramento ${annoSportivo.replace('/', '-')}.${estensione}`
}
