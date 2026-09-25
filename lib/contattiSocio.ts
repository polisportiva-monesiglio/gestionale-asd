import { normalizzaTelefono } from './telefono'
import { formattaGiorno } from './abbonamento'

/**
 * A chi scrive un gestore che ha bisogno di chiarimenti su una richiesta.
 *
 * Non sempre al socio: **se è minorenne si scrive a chi ha firmato per lui**.
 * È la persona che ha dato i propri recapiti, che paga, e che il gestionale
 * indica come firmatario del modulo (vedi `lib/firmatario.ts`, stessa idea
 * applicata all'OTP). Scrivere al ragazzo sarebbe anche un contatto diretto
 * con un minore su un numero che nessun adulto controlla.
 *
 * Il recapito del genitore è un campo solo (`genitore_recapito`), che in
 * archivio contiene un numero oppure un indirizzo: si distinguono dalla
 * chiocciola, non da `genitore_contatto_preferito`, che dice come la persona
 * preferisce essere contattata e non che cosa c'è scritto nel campo.
 *
 * Se del genitore non si sa niente si ripiega sui recapiti del socio, con
 * `perConto` nullo: meglio un contatto possibile che una scheda muta, ma chi
 * guarda deve sapere a chi sta scrivendo.
 */

export type DatiSocio = {
  nome: string | null
  cognome: string | null
  email: string | null
  telefono: string | null
  minorenne: boolean | null
  genitore_nome: string | null
  genitore_cognome: string | null
  genitore_email: string | null
  genitore_recapito: string | null
}

export type Contatto = {
  /** Chi si contatta, nome e cognome: si legge nella scheda. */
  destinatario: string
  /** Solo il nome di battesimo: è come inizia il messaggio. */
  nomeBreve: string
  /** Il nome del socio, quando il destinatario è un'altra persona. Null se si scrive al socio. */
  perConto: string | null
  /** Numero in formato internazionale, pronto per `tel:`. */
  telefono: string | null
}

export type Periodo = { inizio: string | null; fine: string | null }

function nomeIntero(nome: string | null, cognome: string | null): string {
  return [nome, cognome].filter(Boolean).join(' ').trim()
}

export function contattoDi(s: DatiSocio): Contatto {
  const socio = nomeIntero(s.nome, s.cognome) || 'Socio'
  const recapito = s.genitore_recapito?.trim() || null
  const recapitoTelefono = recapito && !recapito.includes('@') ? normalizzaTelefono(recapito) : null

  if (s.minorenne) {
    const genitore = nomeIntero(s.genitore_nome, s.genitore_cognome)
    if (genitore || recapitoTelefono) {
      return {
        destinatario: genitore || 'Chi ha firmato per il socio',
        nomeBreve: s.genitore_nome?.trim() || genitore || 'a te',
        perConto: socio,
        telefono: recapitoTelefono,
      }
    }
  }

  return {
    destinatario: socio,
    nomeBreve: s.nome?.trim() || socio,
    perConto: null,
    telefono: normalizzaTelefono(s.telefono),
  }
}

/**
 * Il messaggio già scritto nel link, che il gestore può cambiare prima di
 * mandarlo. Dice chi scrive, per quale richiesta e **per quale periodo**: il
 * socio sceglie la decorrenza al momento della richiesta e settimane dopo può
 * non ricordare quale mese stia pagando. Un messaggio da un numero
 * sconosciuto che chiede di soldi, senza dire da dove arriva, sembra una
 * truffa.
 */
export function messaggioRichiesta(c: Contatto, attivita: string, periodo?: Periodo): string {
  const quando = periodo?.fine
    ? periodo.inizio
      ? `, dal ${formattaGiorno(periodo.inizio)} al ${formattaGiorno(periodo.fine)}`
      : `, fino al ${formattaGiorno(periodo.fine)}`
    : ''
  const cosa = c.perConto
    ? `per la richiesta di ${c.perConto} (${attivita}${quando})`
    : `per la tua richiesta di ${attivita}${quando}`
  return `Ciao ${c.nomeBreve}, ti scrivo dalla ASD Polisportiva Monesiglio ${cosa}.`
}

/** Il link che apre WhatsApp col messaggio già scritto. Null se non c'è un numero. */
export function linkWhatsApp(c: Contatto, attivita: string, periodo?: Periodo): string | null {
  if (!c.telefono) return null
  return `https://wa.me/${c.telefono.replace('+', '')}?text=${encodeURIComponent(messaggioRichiesta(c, attivita, periodo))}`
}
