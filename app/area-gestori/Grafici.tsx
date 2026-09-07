import type { Fetta } from '@/lib/analisi'

/**
 * I grafici della Dashboard, disegnati con HTML e CSS dal server.
 *
 * Nessuna libreria e nessuno script: la CSP del sito consente script solo da
 * sé stessa (`next.config.ts`), quindi una libreria da CDN non partirebbe, e
 * portarsene una nel pacchetto per quattro barre significherebbe far scaricare
 * a chi apre la Dashboard dal telefono in palestra qualche decina di kB per
 * disegnare dei rettangoli.
 *
 * Le regole seguite sono quelle solite dei grafici leggibili, e sono poche:
 * segni sottili, una griglia che si vede appena, **un solo colore** quando la
 * serie è una sola, e il testo mai colorato come i dati — l'identità la porta
 * la barra, non la scritta.
 */

/** L'unico colore dei dati. Le categorie qui non hanno un ordine naturale:
 *  colorarle una per una direbbe due volte la stessa cosa che dice la
 *  lunghezza della barra, e per giunta male a chi non distingue i colori. */
const COLORE_DATI = '#2a78d6'

export function SchedaGrafico({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string
  sottotitolo?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-5 sm:p-6">
      <h3 className="text-sm font-extrabold text-gray-900">{titolo}</h3>
      {sottotitolo && <p className="text-xs text-gray-400 mt-0.5">{sottotitolo}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Vuoto({ testo }: { testo: string }) {
  return <p className="text-sm text-gray-400 py-6 text-center">{testo}</p>
}

/**
 * Barre orizzontali per confrontare quantità fra categorie.
 *
 * Orizzontali e non verticali perché le etichette sono parole intere ("Sala
 * Pesi - Semestrale"): in verticale andrebbero girate di traverso o tagliate.
 *
 * Ogni barra porta il proprio numero in fondo. Su quattro voci non è il
 * "numero su ogni punto" che rende illeggibile un grafico fitto: è quello che
 * rende questo grafico leggibile anche a chi non vede i colori, e gli fa da
 * tabella senza doverne aggiungere una.
 */
export function BarreOrizzontali({
  dati,
  vuoto = 'Nessun dato per questa stagione.',
  suffisso,
}: {
  dati: Fetta[]
  vuoto?: string
  suffisso?: string
}) {
  if (dati.length === 0) return <Vuoto testo={vuoto} />

  const massimo = Math.max(...dati.map(d => d.valore), 1)
  const totale = dati.reduce((s, d) => s + d.valore, 0)

  return (
    <ul className="space-y-2.5">
      {dati.map(d => {
        const quota = totale > 0 ? Math.round((d.valore / totale) * 100) : 0
        return (
          <li key={d.etichetta} className="flex items-center gap-3">
            <span className="w-28 sm:w-40 shrink-0 text-xs text-gray-600 truncate" title={d.etichetta}>
              {d.etichetta}
            </span>

            {/* La traccia non è un contenitore colorato: è solo lo spazio in
                cui la barra cresce, così barre di grafici diversi restano
                confrontabili fra loro. */}
            <span className="flex-1 min-w-0 h-5 relative">
              <span
                className="absolute inset-y-0 left-0 rounded-r"
                style={{
                  width: `${(d.valore / massimo) * 100}%`,
                  backgroundColor: COLORE_DATI,
                  // Estremo arrotondato dal lato del dato, squadrato sulla
                  // linea di partenza: si legge da dove comincia.
                  borderRadius: '0 4px 4px 0',
                }}
                title={`${d.etichetta}: ${d.valore}${suffisso ? ' ' + suffisso : ''} (${quota}%)`}
              />
            </span>

            <span className="w-14 shrink-0 text-right text-xs font-bold text-gray-900 tabular-nums">
              {d.valore}
              <span className="font-normal text-gray-400"> · {quota}%</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Colonne per l'andamento nel tempo.
 *
 * I periodi a zero **restano nel grafico** come colonne vuote: saltarli
 * appiattirebbe tre iscritti in tre settimane diverse sopra tre iscritti in
 * tre giorni di fila — vedi `andamentoIscrizioni` in `lib/analisi.ts`.
 *
 * Il numero si scrive solo sopra la colonna più alta. Scriverlo su tutte, con
 * una stagione di colonne, sarebbe una fila di cifre che nessuno legge; il
 * valore delle altre resta comunque leggibile passandoci sopra.
 */
export function Colonne({
  punti,
  vuoto = 'Ancora nessuna iscrizione in questa stagione.',
}: {
  punti: (Fetta & { giorno: string })[]
  vuoto?: string
}) {
  if (punti.length === 0) return <Vuoto testo={vuoto} />

  const massimo = Math.max(...punti.map(p => p.valore), 1)
  const indiceMassimo = punti.findIndex(p => p.valore === massimo)

  // Con una stagione intera le etichette non ci starebbero tutte: se ne
  // mostrano circa sei, sempre comprese la prima e l'ultima.
  const passoEtichette = Math.max(1, Math.ceil(punti.length / 6))
  const daEtichettare = (i: number) =>
    i === 0 || i === punti.length - 1 || i % passoEtichette === 0

  return (
    <div>
      {/* L'altezza cresce col contenuto: fissarla taglierebbe la fascia delle
          date e la scheda si ritroverebbe una barra di scorrimento interna. */}
      <div className="flex items-end gap-[2px] h-32 border-b border-gray-200">
        {punti.map((p, i) => (
          <div
            key={p.giorno}
            className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
            title={`${p.etichetta}: ${p.valore} ${p.valore === 1 ? 'iscrizione' : 'iscrizioni'}`}
          >
            {i === indiceMassimo && p.valore > 0 && (
              <span className="text-[10px] font-bold text-gray-900 mb-0.5 tabular-nums">
                {p.valore}
              </span>
            )}
            <div
              className="w-full max-w-[24px] rounded-t"
              style={{
                // Un periodo a zero resta una colonna alta niente, non un buco.
                height: `${(p.valore / massimo) * 100}%`,
                backgroundColor: COLORE_DATI,
                borderRadius: '4px 4px 0 0',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-[2px] mt-1.5">
        {punti.map((p, i) => (
          <div key={p.giorno} className="flex-1 min-w-0 text-center">
            {daEtichettare(i) && (
              <span className="text-[9px] text-gray-400 tabular-nums">{p.etichetta}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Un numero solo, quando il numero è la notizia.
 *
 * Un grafico a una barra non è un grafico: è un numero disegnato in modo
 * complicato.
 */
export function Riquadro({
  etichetta,
  valore,
  nota,
  tono = 'neutro',
}: {
  etichetta: string
  valore: string | number
  nota?: string
  /** `attenzione` solo quando c'è davvero qualcosa da fare: se è sempre acceso
   *  smette di voler dire qualcosa. Il colore non è mai l'unica informazione —
   *  la nota sotto dice a parole di cosa si tratta. */
  tono?: 'neutro' | 'attenzione'
}) {
  const acceso = tono === 'attenzione'
  return (
    <div
      className={`rounded-2xl border p-4 ${
        acceso ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{etichetta}</p>
      <p className={`text-2xl font-extrabold mt-1 ${acceso ? 'text-amber-800' : 'text-gray-900'}`}>
        {valore}
      </p>
      {nota && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{nota}</p>}
    </div>
  )
}
