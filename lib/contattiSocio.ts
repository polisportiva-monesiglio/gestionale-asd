import { normalizzaTelefono } from './telefono'

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
  /** Chi si contatta: il socio, o il genitore se il socio è minorenne. */
  destinatario: string
  /** Il nome del socio, quando il destinatario è un'altra persona. Null se si scrive al socio. */
  perConto: string | null
  /** Numero in formato internazionale, pronto per `tel:`. */
  telefono: string | null
  /** Indirizzo, pronto per `mailto:`. */
  email: string | null
}

function nomeIntero(nome: string | null, cognome: string | null): string {
  return [nome, cognome].filter(Boolean).join(' ').trim()
}

export function contattoDi(s: DatiSocio): Contatto {
  const socio = nomeIntero(s.nome, s.cognome) || 'Socio'
  const recapito = s.genitore_recapito?.trim() || null
  const recapitoEmail = recapito && recapito.includes('@') ? recapito : null
  const recapitoTelefono = recapito && !recapito.includes('@') ? normalizzaTelefono(recapito) : null

  if (s.minorenne) {
    const genitore = nomeIntero(s.genitore_nome, s.genitore_cognome)
    const email = s.genitore_email?.trim() || recapitoEmail
    const telefono = recapitoTelefono
    if (genitore || email || telefono) {
      return {
        destinatario: genitore || 'Chi ha firmato per il socio',
        perConto: socio,
        telefono,
        email: email ?? null,
      }
    }
  }

  return {
    destinatario: socio,
    perConto: null,
    telefono: normalizzaTelefono(s.telefono),
    email: s.email?.trim() || null,
  }
}

/**
 * Il messaggio già scritto nel link, che il gestore può cambiare prima di
 * mandarlo. Dice chi scrive e perché: un messaggio da un numero sconosciuto
 * che chiede di soldi, senza dire da dove arriva, sembra una truffa.
 */
export function messaggioRichiesta(c: Contatto, attivita: string): string {
  const chi = c.perConto
    ? `per la richiesta di ${c.perConto} (${attivita})`
    : `per la tua richiesta di ${attivita}`
  return `Ciao ${c.destinatario}, ti scrivo dalla ASD Polisportiva Monesiglio ${chi}.`
}

/** Il link che apre WhatsApp col messaggio già scritto. Null se non c'è un numero. */
export function linkWhatsApp(c: Contatto, attivita: string): string | null {
  if (!c.telefono) return null
  return `https://wa.me/${c.telefono.replace('+', '')}?text=${encodeURIComponent(messaggioRichiesta(c, attivita))}`
}

/** Il link che apre la posta con oggetto e testo già scritti. Null se non c'è un indirizzo. */
export function linkEmail(c: Contatto, attivita: string): string | null {
  if (!c.email) return null
  const oggetto = `Richiesta di pagamento — ${attivita}`
  return `mailto:${c.email}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(messaggioRichiesta(c, attivita))}`
}
