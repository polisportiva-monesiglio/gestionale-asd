import { nomeProprio, indirizzoNormalizzato } from '@/lib/nomiPropri'
import { normalizzaTelefono } from '@/lib/telefono'
import { codiceFiscaleValido } from '@/lib/codiceFiscale'
import { dataNascitaPlausibile, eMinorenne } from '@/lib/firmatario'

/**
 * Le correzioni che un gestore può fare all'anagrafica di un socio.
 *
 * La regola che tiene insieme tutto: **si corregge il registro di lavoro, non
 * il documento.** La riga in tabella alimenta foglio UISP, ricevute ed
 * elenchi, e quando è sbagliata va sistemata; il modulo firmato resta com'è,
 * perché è la dichiarazione che il socio ha fatto davvero. Il registro delle
 * correzioni serve proprio a spiegare perché i due non coincidono più.
 */

export type Gruppo = 'anagrafica' | 'residenza' | 'contatti'

export type Campo = {
  chiave: string
  etichetta: string
  tipo: 'testo' | 'data'
  gruppo: Gruppo
  /** Come si scrive il valore prima di salvarlo, con le stesse regole che
   *  usa l'iscrizione: se no una correzione a mano rimetterebbe dentro
   *  proprio le maiuscole storte che il modulo evita. */
  normalizza?: 'nome' | 'indirizzo' | 'maiuscolo' | 'telefono'
  /**
   * Vero per i campi che non sono solo un refuso: cambiarli sposta qualcosa
   * d'altro. La data di nascita decide chi ha diritto di firmare, il codice
   * fiscale è la chiave con cui il socio esiste una volta sola.
   */
  delicato?: boolean
  aiuto?: string
}

export const CAMPI: Campo[] = [
  { chiave: 'cognome', etichetta: 'Cognome', tipo: 'testo', gruppo: 'anagrafica', normalizza: 'nome' },
  { chiave: 'nome', etichetta: 'Nome', tipo: 'testo', gruppo: 'anagrafica', normalizza: 'nome' },
  { chiave: 'luogo_nascita', etichetta: 'Luogo di nascita', tipo: 'testo', gruppo: 'anagrafica', normalizza: 'nome' },
  { chiave: 'provincia_nascita', etichetta: 'Provincia di nascita', tipo: 'testo', gruppo: 'anagrafica', normalizza: 'maiuscolo' },
  {
    chiave: 'data_nascita', etichetta: 'Data di nascita', tipo: 'data', gruppo: 'anagrafica',
    delicato: true,
    aiuto: 'Decide se il socio firma da sé o serve un genitore.',
  },
  {
    chiave: 'cf', etichetta: 'Codice fiscale', tipo: 'testo', gruppo: 'anagrafica',
    normalizza: 'maiuscolo', delicato: true,
    aiuto: 'Deve restare unico: è con questo che il gestionale riconosce la persona.',
  },

  { chiave: 'indirizzo', etichetta: 'Indirizzo', tipo: 'testo', gruppo: 'residenza', normalizza: 'indirizzo' },
  { chiave: 'cap', etichetta: 'CAP', tipo: 'testo', gruppo: 'residenza' },
  { chiave: 'citta', etichetta: 'Città', tipo: 'testo', gruppo: 'residenza', normalizza: 'nome' },
  { chiave: 'provincia_residenza', etichetta: 'Provincia', tipo: 'testo', gruppo: 'residenza', normalizza: 'maiuscolo' },

  { chiave: 'telefono', etichetta: 'Telefono', tipo: 'testo', gruppo: 'contatti', normalizza: 'telefono' },
]

/**
 * L'email **non** è in questo elenco, e non è una dimenticanza.
 *
 * È l'indirizzo con cui il socio entra: il collegamento fra la riga in tabella
 * e il suo accesso si regge sul confronto esatto fra le due. Cambiarla qui e
 * basta lo scollegherebbe dal proprio account senza che nessuno se ne accorga
 * — entrerebbe e non troverebbe più i suoi dati. Per cambiare un'email serve
 * toccare anche l'utenza, ed è un'operazione a sé.
 */
export const PERCHE_NIENTE_EMAIL =
  'L’email non si corregge da qui: è quella con cui il socio accede, e cambiarla soltanto in anagrafica lo scollegherebbe dal proprio account.'

export type Differenza = { campo: string; etichetta: string; prima: string | null; dopo: string | null }

export type Esito =
  | { ok: true; valori: Record<string, unknown>; differenze: Differenza[] }
  | { ok: false; errori: { campo: string; messaggio: string }[] }

function normalizzato(campo: Campo, grezzo: string): string {
  const v = grezzo.trim()
  if (v === '') return ''
  switch (campo.normalizza) {
    case 'nome': return nomeProprio(v)
    case 'indirizzo': return indirizzoNormalizzato(v)
    case 'maiuscolo': return v.toLocaleUpperCase('it')
    case 'telefono': return normalizzaTelefono(v) ?? v
    default: return v
  }
}

const vuotoSeNullo = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/**
 * Confronta quello che c'è con quello che il gestore ha scritto, e dice cosa
 * cambierebbe davvero.
 *
 * Restituisce **solo le differenze**: un campo riscritto identico non finisce
 * nel registro. Un registro che segna anche i non-cambiamenti diventa
 * illeggibile nel giro di un mese, e la domanda a cui deve rispondere è «cosa
 * è stato cambiato», non «quante volte è stato aperto il modulo».
 */
export function preparaCorrezioni(
  attuale: Record<string, unknown>,
  richiesti: Record<string, string>,
  oggi: Date = new Date()
): Esito {
  const errori: { campo: string; messaggio: string }[] = []
  const valori: Record<string, unknown> = {}
  const differenze: Differenza[] = []

  for (const campo of CAMPI) {
    if (!(campo.chiave in richiesti)) continue

    const prima = vuotoSeNullo(attuale[campo.chiave])
    const dopo = normalizzato(campo, richiesti[campo.chiave] ?? '')

    if (campo.chiave === 'cf' && dopo !== '' && !codiceFiscaleValido(dopo)) {
      errori.push({ campo: campo.chiave, messaggio: 'Codice fiscale non valido: ricontrolla le sedici cifre.' })
      continue
    }

    if (campo.chiave === 'data_nascita' && dopo !== '') {
      const p = dataNascitaPlausibile(dopo, oggi)
      if (!p.ok) {
        errori.push({ campo: campo.chiave, messaggio: p.motivo })
        continue
      }
    }

    if (dopo === prima) continue

    valori[campo.chiave] = dopo === '' ? null : dopo
    differenze.push({
      campo: campo.chiave,
      etichetta: campo.etichetta,
      prima: prima === '' ? null : prima,
      dopo: dopo === '' ? null : dopo,
    })
  }

  if (errori.length > 0) return { ok: false, errori }

  // Se cambia la data di nascita, `minorenne` va rifatto: è un valore
  // calcolato, e lasciarlo com'era vorrebbe dire correggere la data e tenersi
  // la conseguenza sbagliata della data vecchia — che è esattamente il guaio
  // da cui è nata questa funzione.
  if ('data_nascita' in valori && valori.data_nascita) {
    const primaMinorenne = attuale.minorenne === true
    const adessoMinorenne = eMinorenne(String(valori.data_nascita), oggi)

    if (adessoMinorenne !== primaMinorenne) {
      valori.minorenne = adessoMinorenne
      differenze.push({
        campo: 'minorenne', etichetta: 'Minorenne',
        prima: primaMinorenne ? 'sì' : 'no',
        dopo: adessoMinorenne ? 'sì' : 'no',
      })

      // Diventato maggiorenne: i dati del genitore non hanno più titolo per
      // stare lì. Si svuotano, e ognuno lascia la sua riga nel registro:
      // sono dati personali di un terzo, e sparire in silenzio non va bene.
      if (!adessoMinorenne) {
        for (const [chiave, etichetta] of [
          ['genitore_nome', 'Nome del genitore'],
          ['genitore_cognome', 'Cognome del genitore'],
          ['genitore_email', 'Email del genitore'],
          ['genitore_contatto_preferito', 'Contatto preferito del genitore'],
          ['genitore_recapito', 'Recapito del genitore'],
        ] as const) {
          const prima = vuotoSeNullo(attuale[chiave])
          if (prima === '') continue
          valori[chiave] = null
          differenze.push({ campo: chiave, etichetta, prima, dopo: null })
        }
      }
    }
  }

  return { ok: true, valori, differenze }
}
