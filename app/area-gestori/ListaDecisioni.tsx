import { quandoLeggibile, type Decisione } from '@/lib/storicoDecisioni'

/**
 * L'elenco delle decisioni gia' prese, in ordine dalla piu' recente.
 *
 * La usano in due: la pagina dello storico, dove le richieste sono di tutti, e
 * il dettaglio di un socio nella lista, dove sono le sue. Cambia solo se il
 * nome del socio va scritto o e' gia' scritto sopra: `mostraSocio`.
 *
 * Non e' un componente client: non ha niente da cliccare, e il posto da cui
 * viene aperta decide se finisce nel bundle del browser.
 */
export function ListaDecisioni({
  decisioni,
  mostraSocio = true,
  vuoto = 'Nessuna decisione registrata.',
}: {
  decisioni: Decisione[]
  mostraSocio?: boolean
  vuoto?: string
}) {
  if (decisioni.length === 0) {
    return <p className="text-sm text-gray-400 py-3">{vuoto}</p>
  }

  return (
    <ul className="space-y-2.5">
      {decisioni.map((d) => {
        const rifiutata = d.esito === 'rifiutata'
        return (
          <li
            key={d.abbonamentoId}
            className={`rounded-2xl border p-3.5 ${
              rifiutata ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {mostraSocio && (
                  <p className="text-sm font-bold text-gray-900 truncate">{d.socio}</p>
                )}
                <p className={`text-xs ${mostraSocio ? 'text-gray-500 mt-0.5' : 'font-bold text-gray-900 text-sm'}`}>
                  {d.attivita}
                  {!mostraSocio && d.annoSportivo ? (
                    <span className="font-normal text-gray-400"> · {d.annoSportivo}</span>
                  ) : null}
                </p>

                <p className="text-xs text-gray-600 mt-1.5">
                  <span className={`font-bold ${rifiutata ? 'text-red-700' : 'text-green-700'}`}>
                    {rifiutata ? 'Rifiutata' : 'Accettata'}
                  </span>
                  {' da '}
                  {/* Le decisioni prese prima del 7 settembre 2026 non hanno un
                      nome perche' non veniva registrato. Si dice, invece di
                      lasciare uno spazio bianco che sembra un errore. */}
                  <span className="font-semibold text-gray-800">
                    {d.chi ?? 'gestore non registrato'}
                  </span>
                  {' il '}
                  {quandoLeggibile(d.quando, d.oraNota)}
                </p>

                {rifiutata && d.motivoRifiuto && (
                  <p className="mt-2 rounded-xl bg-white border border-red-200 px-3 py-2 text-xs text-red-800 leading-relaxed">
                    <span className="font-bold block mb-0.5">Motivo</span>
                    {d.motivoRifiuto}
                  </p>
                )}
              </div>

              {!rifiutata && (
                <div className="text-right shrink-0">
                  {d.importo != null && (
                    <p className="text-sm font-extrabold text-green-800">
                      € {d.importo.toFixed(2)}
                    </p>
                  )}
                  {d.numeroRicevuta && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{d.numeroRicevuta}</p>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
