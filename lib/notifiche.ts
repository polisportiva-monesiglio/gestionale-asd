import 'server-only'
import { Resend } from 'resend'
import { emailPlausibile, testoSicuroHtml } from '@/lib/email'

/**
 * Le email che il gestionale manda per conto proprio, quando succede qualcosa.
 *
 * Regola unica di questo file: **una notifica non fa mai fallire l'operazione
 * che la genera**. Un'iscrizione firmata, un pagamento confermato e una
 * richiesta inoltrata sono fatti compiuti e gia' registrati; se il postino non
 * parte si scrive nel registro e si tira dritto. Il contrario — un
 * tesseramento che si rifiuta perche' Resend era irraggiungibile — sarebbe un
 * pessimo affare.
 *
 * Per questo ogni funzione qui dentro restituisce void e non solleva niente.
 */

const MITTENTE = 'Polisportiva Monesiglio <info@polisportiva-monesiglio.it>'
const SITO = 'https://www.polisportiva-monesiglio.it'

/**
 * Dove arrivano le segnalazioni per la segreteria.
 *
 * Si cambia senza toccare il codice, con EMAIL_ASD fra le variabili
 * d'ambiente. Il valore predefinito e' la casella del dominio, la stessa da
 * cui si spedisce.
 */
function destinatarioAsd(): string | null {
  const scelto = process.env.EMAIL_ASD?.trim()
  const indirizzo = scelto && scelto.length > 0 ? scelto : 'info@polisportiva-monesiglio.it'
  if (!emailPlausibile(indirizzo)) {
    console.error("EMAIL_ASD non e' un indirizzo valido, notifica non spedita:", indirizzo)
    return null
  }
  return indirizzo
}

type Allegato = { filename: string; content: Buffer }

async function spedisci(opzioni: {
  a: string[]
  oggetto: string
  html: string
  allegati?: Allegato[]
}): Promise<void> {
  const destinatari = opzioni.a.filter(emailPlausibile)
  if (destinatari.length === 0) {
    console.error('Notifica senza destinatari validi:', opzioni.oggetto)
    return
  }

  const chiave = process.env.RESEND_API_KEY
  if (!chiave) {
    console.error('RESEND_API_KEY non configurata: notifica non spedita:', opzioni.oggetto)
    return
  }

  try {
    const { error } = await new Resend(chiave).emails.send({
      from: MITTENTE,
      to: destinatari,
      subject: opzioni.oggetto,
      html: opzioni.html,
      ...(opzioni.allegati?.length ? { attachments: opzioni.allegati } : {}),
    })
    if (error) console.error('Notifica rifiutata da Resend:', opzioni.oggetto, error.message)
  } catch (e) {
    console.error('Invio della notifica fallito:', opzioni.oggetto, e)
  }
}

/** La stessa cornice per tutte: intestazione, corpo, piede. */
function guscio(titolo: string, corpo: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 10px; color: #111827;">
      <h2 style="color: #b89f21; margin: 0 0 4px;">Polisportiva Monesiglio</h2>
      <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">${testoSicuroHtml(titolo)}</p>
      ${corpo}
      <p style="margin-top: 28px; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 12px;">
        Messaggio automatico del gestionale della ASD Polisportiva Monesiglio.
      </p>
    </div>
  `
}

/** Una riga "etichetta / valore" della tabellina. Se il valore manca, sparisce. */
function voce(etichetta: string, valore: string | null | undefined): string {
  if (valore === null || valore === undefined || valore === '') return ''
  return `
    <tr>
      <td style="padding: 4px 12px 4px 0; font-size: 13px; color: #6b7280; vertical-align: top;">${testoSicuroHtml(etichetta)}</td>
      <td style="padding: 4px 0; font-size: 13px; font-weight: bold;">${testoSicuroHtml(valore)}</td>
    </tr>
  `
}

function euro(n: number): string {
  return `€ ${n.toFixed(2)}`
}

/**
 * Al socio: il pagamento e' stato accettato, ecco la ricevuta.
 *
 * Per un minorenne il messaggio va anche a chi ha firmato per lui: e' la
 * persona che ha pagato, e l'indirizzo del ragazzo puo' essere una casella che
 * nessun adulto guarda.
 */
export async function notificaPagamentoConfermato(dati: {
  emailSocio: string | null | undefined
  emailGenitore?: string | null
  nomeSocio: string
  attivita: string
  importoAttivita: number
  importoUisp: number
  metodo: string
  numeroRicevuta: string
  annoSportivo: string
  ricevutaPdf?: Buffer
}): Promise<void> {
  // Genitore e socio possono avere lo stesso indirizzo: senza questo passaggio
  // arriverebbero due copie della stessa ricevuta.
  const unici = [
    ...new Set(
      [dati.emailSocio, dati.emailGenitore]
        .filter((x): x is string => emailPlausibile(x))
        .map((x) => x.trim().toLowerCase())
    ),
  ]

  const totale = dati.importoAttivita + dati.importoUisp

  const corpo = `
    <p style="font-size: 15px;">Ciao ${testoSicuroHtml(dati.nomeSocio)},</p>
    <p style="font-size: 15px;">abbiamo registrato il tuo pagamento. La ricevuta è in allegato, e la trovi anche nella tua area personale.</p>
    <table style="border-collapse: collapse; margin: 16px 0;">
      ${voce('Ricevuta n.', dati.numeroRicevuta)}
      ${voce('Attività', dati.attivita)}
      ${voce('Stagione', dati.annoSportivo)}
      ${voce('Quota attività', euro(dati.importoAttivita))}
      ${dati.importoUisp > 0 ? voce('Tessera UISP', euro(dati.importoUisp)) : ''}
      ${voce('Totale', euro(totale))}
      ${voce('Metodo', dati.metodo)}
    </table>
    <p style="font-size: 14px;"><a href="${SITO}/area-socio" style="color: #b89f21;">Vai alla tua area personale</a></p>
  `

  await spedisci({
    a: unici,
    oggetto: `Pagamento confermato — ricevuta ${dati.numeroRicevuta}`,
    html: guscio('Conferma di pagamento', corpo),
    allegati: dati.ricevutaPdf
      ? [{ filename: `${dati.numeroRicevuta}.pdf`, content: dati.ricevutaPdf }]
      : undefined,
  })
}

/**
 * Alla segreteria: si è iscritto qualcuno di nuovo.
 *
 * Volutamente scarna. Codice fiscale, residenza, consensi e modulo firmato
 * restano nel gestionale, dove sono protetti da RLS e da un accesso: un'email
 * è una copia che finisce in una casella e lì resta per sempre. Qui basta
 * sapere chi è arrivato, e che c'è qualcosa da guardare.
 */
export async function notificaNuovaIscrizione(dati: {
  nome: string
  cognome: string
  emailSocio: string
  annoSportivo: string
  minorenne: boolean
  scadenzaCertificato: string | null
}): Promise<void> {
  const a = destinatarioAsd()
  if (!a) return

  const scadenza = dati.scadenzaCertificato
    ? new Date(dati.scadenzaCertificato).toLocaleDateString('it-IT')
    : null

  const corpo = `
    <p style="font-size: 15px;">È arrivata una nuova iscrizione firmata.</p>
    <table style="border-collapse: collapse; margin: 16px 0;">
      ${voce('Socio', `${dati.cognome} ${dati.nome}`)}
      ${voce('Email', dati.emailSocio)}
      ${voce('Stagione', dati.annoSportivo)}
      ${dati.minorenne ? voce('Minorenne', 'sì, ha firmato chi esercita la responsabilità genitoriale') : ''}
      ${voce('Certificato valido fino al', scadenza)}
    </table>
    <p style="font-size: 14px;">Il modulo firmato e il resto dei dati sono nell'area gestori.</p>
    <p style="font-size: 14px;"><a href="${SITO}/area-gestori/soci" style="color: #b89f21;">Apri l'elenco dei soci</a></p>
  `

  await spedisci({
    a: [a],
    oggetto: `Nuova iscrizione: ${dati.cognome} ${dati.nome}`,
    html: guscio('Nuova iscrizione', corpo),
  })
}

/** Alla segreteria: un socio chiede di pagare, c'è da confermare. */
export async function notificaNuovaRichiesta(dati: {
  nomeSocio: string
  attivita: string
  importoAttivita: number
  importoUisp: number
  metodo: string | null
  note: string | null
  annoSportivo: string
}): Promise<void> {
  const a = destinatarioAsd()
  if (!a) return

  const totale = dati.importoAttivita + dati.importoUisp

  const corpo = `
    <p style="font-size: 15px;">Un socio ha chiesto di pagare. La richiesta aspetta una conferma nell'area gestori.</p>
    <table style="border-collapse: collapse; margin: 16px 0;">
      ${voce('Socio', dati.nomeSocio)}
      ${voce('Attività', dati.attivita)}
      ${voce('Stagione', dati.annoSportivo)}
      ${voce('Quota attività', euro(dati.importoAttivita))}
      ${dati.importoUisp > 0 ? voce('Tessera UISP', euro(dati.importoUisp)) : ''}
      ${voce('Totale', euro(totale))}
      ${voce('Metodo indicato', dati.metodo)}
      ${voce('Note del socio', dati.note)}
    </table>
    <p style="font-size: 14px;"><a href="${SITO}/area-gestori" style="color: #b89f21;">Conferma il pagamento</a></p>
  `

  await spedisci({
    a: [a],
    oggetto: `Nuova richiesta di pagamento: ${dati.nomeSocio}`,
    html: guscio('Richiesta di pagamento', corpo),
  })
}
