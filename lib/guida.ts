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
    'Due momenti separati: prima ti tesseri, una volta all’anno. Poi prendi l’abbonamento, quando ti serve. Tutto dal telefono.',

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
      titolo: 'L’abbonamento',
      passi: [
        '[Accedi all’area personale]: basta l’email, nessuna password.',
        'Nella scheda *Abbonamento* scegli durata e da quando parte.',
        'Indichi come paghi e premi [Invia richiesta].',
      ],
      esito: 'Paghi *in sede*. La segreteria conferma e scarichi la ricevuta.',
    },
  ],

  inciampiTitolo: 'Quattro cose che fanno perdere tempo',
  inciampi: [
    '*Sul sito non si paga.* La richiesta prenota l’abbonamento; i soldi si portano in palestra.',
    '*Il codice dura dieci minuti.* E se torni indietro a correggere un dato non vale più: ne chiedi un altro.',
    '*Se sei minorenne* l’email da indicare è quella del genitore: il codice per firmare arriva lì.',
    '*Una durata è spenta?* Nessun abbonamento può finire dopo il 31 agosto, quindi più la stagione avanza, meno durate restano.',
  ],

  rinnovo:
    '*Eri già socio l’anno scorso?* Non rifare l’iscrizione: entra nell’area personale e premi [Rinnova].',
  contatto: 'Il codice non arriva? Guarda nello spam. Per tutto il resto scrivi a',
  email: 'info@polisportiva-monesiglio.it',
} as const
