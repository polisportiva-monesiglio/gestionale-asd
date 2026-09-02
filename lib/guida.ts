/**
 * Il testo della guida per i soci, in un posto solo.
 *
 * Lo leggono in due: la pagina `/guida` e il PDF che si scarica da lì. Tenerlo
 * qui evita l'errore classico, cioe' correggere una frase sulla pagina e
 * lasciare il PDF a dire un'altra cosa.
 *
 * Nel testo due segni, gli unici: `*parola*` per l'enfasi e `[Pulsante]` per il
 * nome di un comando che si vede a schermo.
 */

export type Pezzo = { testo: string; tipo: 'normale' | 'forte' | 'pulsante' }

/** Spezza una frase nei pezzi da rendere: testo piano, enfasi, nomi di pulsanti. */
export function pezzi(frase: string): Pezzo[] {
  return frase
    .split(/(\*[^*]+\*|\[[^\]]+\])/g)
    .filter(Boolean)
    .map(p => {
      if (p.startsWith('*') && p.endsWith('*')) return { testo: p.slice(1, -1), tipo: 'forte' as const }
      if (p.startsWith('[') && p.endsWith(']')) return { testo: p.slice(1, -1), tipo: 'pulsante' as const }
      return { testo: p, tipo: 'normale' as const }
    })
}

/** La stessa frase senza i segni, per quando serve piana. */
export function piana(frase: string): string {
  return pezzi(frase).map(p => p.testo).join('')
}

export const GUIDA = {
  ente: 'A.S.D. Polisportiva Monesiglio',
  titolo: 'Iscriversi, in breve',
  sottotitolo:
    'Due momenti separati: prima ti tesseri, una volta l’anno. Poi scegli il periodo di frequenza, quando ti serve. Tutto dal telefono.',

  serveTitolo: 'Tieni a portata',
  serve: ['codice fiscale', 'certificato medico in foto o PDF', 'un’email che apri subito'],

  fasi: [
    {
      quando: 'Una volta all’anno',
      titolo: 'Il tesseramento',
      passi: [
        'Sul sito premi [Nuova iscrizione] e compili i tuoi dati.',
        'Carichi il certificato medico con la *data della visita*, quella scritta sul documento.',
        'Spunti le cinque caselle, ricevi un codice per email, firmi.',
      ],
      esito: 'Scarichi il modulo firmato e *sei socio*.',
    },
    {
      quando: 'Ogni volta che serve',
      titolo: 'Il periodo di frequenza',
      passi: [
        '[Accedi all’area personale]: basta l’email, nessuna password.',
        'Nella scheda *Frequenza* scegli durata e da quando parte.',
        'Paghi a un consigliere, con bonifico o con Satispay, e premi [Invia richiesta].',
      ],
      esito: 'La segreteria conferma e scarichi la *ricevuta*.',
    },
  ],

  inciampiTitolo: 'Da sapere',
  inciampi: [
    '*Sul sito non si paga.* Si paga a un consigliere, con bonifico o con Satispay: la richiesta serve a farsi dare la conferma.',
    '*Il codice dura dieci minuti.* E se torni indietro a correggere un dato non vale più: ne chiedi un altro.',
    '*Se sei minorenne* l’email da indicare è quella del genitore: il codice per firmare arriva lì.',
    '*Una durata non è selezionabile?* Nessun periodo di frequenza può finire dopo il 31 agosto, quindi più la stagione avanza, meno durate restano.',
  ],

  rinnovo:
    '*Eri già socio l’anno scorso?* Quest’anno l’iscrizione va rifatta lo stesso, perché i tuoi dati non li abbiamo ancora. Dall’anno prossimo basterà entrare nell’area personale e premere [Rinnova].',
  contatto: 'Il codice non arriva? Guarda nello spam. Per tutto il resto scrivi a',
  email: 'info@polisportiva-monesiglio.it',
} as const
