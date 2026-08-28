import { eMinorenne } from '@/lib/firmatario'

/**
 * Il rinnovo del tesseramento per una nuova stagione.
 *
 * L'anagrafica del socio si scrive una volta e resta: quello che si rifà ogni
 * anno è la **dichiarazione annuale** — stato di salute, accettazione di
 * statuto e regolamento nella versione in vigore *quest'anno*, presa d'atto
 * dell'informativa, e la firma che lega il tutto a quel contenuto.
 *
 * Regola portante di questo modulo: **l'identità viene dal database, mai dal
 * browser.** Il socio può correggere dove abita e come lo si contatta, non chi
 * è. Se nome, data di nascita o codice fiscale arrivassero dal client,
 * basterebbe cambiarli per firmare un modulo a nome di un altro — e il codice
 * OTP, che dimostra il controllo di una casella, non se ne accorgerebbe.
 */

/** Quello che il socio può correggere da solo al rinnovo. */
export type ModificheAnagrafica = {
  indirizzoResidenza?: string
  capResidenza?: string
  cittaResidenza?: string
  provinciaResidenza?: string
  telefono?: string
  email?: string
  // Solo se ancora minorenne: chi firma per lui e come lo si raggiunge.
  genitoreNome?: string
  genitoreCognome?: string
  genitoreEmail?: string
  genitoreContattoScelta?: string
  genitoreContatto?: string
}

export const CAMPI_MODIFICABILI = [
  'indirizzoResidenza', 'capResidenza', 'cittaResidenza', 'provinciaResidenza',
  'telefono', 'email',
  'genitoreNome', 'genitoreCognome', 'genitoreEmail',
  'genitoreContattoScelta', 'genitoreContatto',
] as const

export type Consensi = {
  dichiarazioneSalute: boolean
  accettazioneStatutoRegolamento: boolean
  presaAttoVideosorveglianza: boolean
  presaAttoInformativa: boolean
  consensoImmagini: boolean
}

/** La riga di `soci` che serve a comporre il rinnovo. */
export type SocioPerRinnovo = {
  id: string
  nome: string | null
  cognome: string | null
  sesso: string | null
  cf: string | null
  data_nascita: string | null
  luogo_nascita: string | null
  provincia_nascita: string | null
  cittadinanza: string | null
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia_residenza: string | null
  telefono: string | null
  email: string | null
  genitore_nome: string | null
  genitore_cognome: string | null
  genitore_email: string | null
  genitore_contatto_preferito: string | null
  genitore_recapito: string | null
}

function testo(valore: unknown): string {
  return typeof valore === 'string' ? valore.trim() : ''
}

/** Prende la modifica se c'è, altrimenti quello che risulta a database. */
function aggiornato(modifica: unknown, attuale: string | null): string {
  const m = testo(modifica)
  return m !== '' ? m : (attuale ?? '')
}

/**
 * Compone il contenuto che verrà firmato.
 *
 * La stessa funzione la usano la rotta che spedisce il codice e quella che
 * verifica la firma: se le due componessero l'oggetto in modo anche solo
 * leggermente diverso, l'impronta non corrisponderebbe e nessun rinnovo
 * andrebbe mai a buon fine. È lo stesso motivo per cui `firmatarioDi` esiste
 * in un modulo solo.
 */
export function datiRinnovo(
  socio: SocioPerRinnovo,
  modifiche: ModificheAnagrafica,
  consensi: Consensi,
  adesso: Date = new Date()
): Record<string, unknown> {
  // Ricalcolata ogni anno, non ereditata: il ragazzo iscritto a sedici anni
  // non è minorenne per sempre, e da quando compie diciotto anni firma da sé.
  const minorenne = eMinorenne(socio.data_nascita, adesso)

  return {
    // Identità: dal database, non toccabile.
    nome: socio.nome ?? '',
    cognome: socio.cognome ?? '',
    sesso: socio.sesso ?? '',
    dataNascita: socio.data_nascita ?? '',
    luogoNascita: socio.luogo_nascita ?? '',
    provinciaNascita: socio.provincia_nascita ?? '',
    cittadinanza: socio.cittadinanza ?? '',
    codiceFiscale: socio.cf ?? '',

    // Recapiti e residenza: correggibili dal socio.
    indirizzoResidenza: aggiornato(modifiche.indirizzoResidenza, socio.indirizzo),
    capResidenza: aggiornato(modifiche.capResidenza, socio.cap),
    cittaResidenza: aggiornato(modifiche.cittaResidenza, socio.citta),
    provinciaResidenza: aggiornato(modifiche.provinciaResidenza, socio.provincia_residenza),
    telefono: aggiornato(modifiche.telefono, socio.telefono),
    email: aggiornato(modifiche.email, socio.email),

    // I dati del genitore esistono solo finché il socio è minorenne. Per un
    // maggiorenne restano vuoti, così il modulo firmato non porta i dati di
    // un terzo che non c'entra più.
    genitoreNome: minorenne ? aggiornato(modifiche.genitoreNome, socio.genitore_nome) : '',
    genitoreCognome: minorenne ? aggiornato(modifiche.genitoreCognome, socio.genitore_cognome) : '',
    genitoreEmail: minorenne ? aggiornato(modifiche.genitoreEmail, socio.genitore_email) : '',
    genitoreContattoScelta: minorenne
      ? aggiornato(modifiche.genitoreContattoScelta, socio.genitore_contatto_preferito)
      : '',
    genitoreContatto: minorenne
      ? aggiornato(modifiche.genitoreContatto, socio.genitore_recapito)
      : '',

    // I consensi dell'anno.
    dichiarazioneSalute: consensi.dichiarazioneSalute === true,
    accettazioneStatutoRegolamento: consensi.accettazioneStatutoRegolamento === true,
    presaAttoVideosorveglianza: consensi.presaAttoVideosorveglianza === true,
    presaAttoInformativa: consensi.presaAttoInformativa === true,
    consensoImmagini: consensi.consensoImmagini === true,
  }
}

/** I quattro obbligatori. Le immagini restano facoltative. */
export function consensiCompleti(c: Consensi): boolean {
  return (
    c.dichiarazioneSalute === true &&
    c.accettazioneStatutoRegolamento === true &&
    c.presaAttoVideosorveglianza === true &&
    c.presaAttoInformativa === true
  )
}

export function leggiConsensi(corpo: Record<string, unknown> | null | undefined): Consensi {
  const c = corpo ?? {}
  return {
    dichiarazioneSalute: c.dichiarazioneSalute === true,
    accettazioneStatutoRegolamento: c.accettazioneStatutoRegolamento === true,
    presaAttoVideosorveglianza: c.presaAttoVideosorveglianza === true,
    presaAttoInformativa: c.presaAttoInformativa === true,
    consensoImmagini: c.consensoImmagini === true,
  }
}

export function leggiModifiche(corpo: Record<string, unknown> | null | undefined): ModificheAnagrafica {
  const c = corpo ?? {}
  const fuori: ModificheAnagrafica = {}
  for (const campo of CAMPI_MODIFICABILI) {
    const v = c[campo]
    if (typeof v === 'string') fuori[campo] = v.trim()
  }
  return fuori
}

/** Le colonne di `soci` da riscrivere dopo un rinnovo andato a buon fine. */
export function aggiornamentoSocio(
  dati: Record<string, unknown>,
  minorenne: boolean
): Record<string, unknown> {
  return {
    indirizzo: dati.indirizzoResidenza,
    cap: dati.capResidenza,
    citta: dati.cittaResidenza,
    provincia_residenza: dati.provinciaResidenza,
    telefono: dati.telefono,
    email: dati.email,
    minorenne,
    genitore_nome: minorenne ? dati.genitoreNome : null,
    genitore_cognome: minorenne ? dati.genitoreCognome : null,
    genitore_email: minorenne ? dati.genitoreEmail : null,
    genitore_contatto_preferito: minorenne ? dati.genitoreContattoScelta : null,
    genitore_recapito: minorenne ? dati.genitoreContatto : null,
  }
}
