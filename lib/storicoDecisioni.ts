import { FUSO } from '@/lib/dataRoma'

/**
 * Lo storico delle decisioni prese sulle richieste di frequenza.
 *
 * Serve a rispondere alla domanda che un consiglio si fa di continuo: **chi ha
 * accettato cosa, e quando**. Prima non si poteva, e non per una mancanza
 * dell'interfaccia: le due decisioni erano registrate in modo opposto e
 * nessuna delle due per intero. L'accettazione diceva chi ma non l'ora, il
 * rifiuto diceva l'ora al secondo ma non chi. La migrazione del 7 settembre
 * 2026 ha pareggiato le due strade; questo modulo le rilegge insieme.
 *
 * Le due decisioni vivono in due posti diversi e non si possono unire in
 * tabella: l'accettazione lascia una ricevuta in `pagamenti_ricevute`, il
 * rifiuto resta una colonna su `abbonamenti_soci`. Non e' una svista da
 * correggere - una ricevuta e' un documento numerato, un rifiuto e' uno stato -
 * quindi le si accosta qui, in lettura.
 */

export type Esito = 'accettata' | 'rifiutata'

export type Decisione = {
  abbonamentoId: string
  socioId: string | null
  socio: string
  attivita: string
  annoSportivo: string
  esito: Esito
  /** Il nome del gestore, o `null` per le decisioni prese prima che si registrasse. */
  chi: string | null
  /** Istante ISO della decisione, o `null` se non si conosce nemmeno il giorno. */
  quando: string | null
  /**
   * Falso quando di `quando` si conosce solo il giorno.
   *
   * Le quattordici ricevute emesse prima del 7 settembre 2026 hanno soltanto
   * `data_incasso`, che e' una data. Mostrare "00:00" sarebbe inventare un
   * orario che nessuno ha registrato.
   */
  oraNota: boolean
  importo: number | null
  numeroRicevuta: string | null
  motivoRifiuto: string | null
  richiestaIl: string | null
}

type Cliente = { from: (tabella: string) => any }

type Filtri = {
  socioId?: string
  annoSportivo?: string
  limite?: number
}

/** Supabase restituisce le relazioni come oggetto o come array di uno. */
function primo<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export async function leggiDecisioni(
  supabase: Cliente,
  filtri: Filtri = {}
): Promise<{ decisioni: Decisione[]; errore: string | null }> {
  let q = supabase
    .from('abbonamenti_soci')
    .select(`
      id, socio_id, anno_sportivo, stato_pagamento, data_acquisto,
      importo_tesseramento_uisp, motivo_rifiuto, rifiutato_il, rifiutato_da_nome,
      catalogo_attivita(nome_attivita, prezzo_base),
      soci(id, nome, cognome),
      pagamenti_ricevute(operatore, confermato_il, data_incasso, numero_ricevuta, importo_pagato)
    `)
    // Le richieste ancora da decidere non sono storia: stanno nella prima
    // pagina dell'area gestori, fra le cose da fare.
    .in('stato_pagamento', ['pagato', 'rifiutato'])

  if (filtri.socioId) q = q.eq('socio_id', filtri.socioId)
  if (filtri.annoSportivo) q = q.eq('anno_sportivo', filtri.annoSportivo)

  const { data, error } = await q
  if (error) return { decisioni: [], errore: error.message }

  const decisioni: Decisione[] = (data ?? []).map((r: any) => {
    const attivita = primo<{ nome_attivita?: string; prezzo_base?: number }>(r.catalogo_attivita)
    const socio = primo<{ id?: string; nome?: string; cognome?: string }>(r.soci)
    const ricevuta = primo<{
      operatore?: string
      confermato_il?: string | null
      data_incasso?: string | null
      numero_ricevuta?: string | null
      importo_pagato?: number | string | null
    }>(r.pagamenti_ricevute)

    const rifiutata = r.stato_pagamento === 'rifiutato'

    // Per un'accettazione l'ora esatta c'e' solo dalle ricevute emesse dal 7
    // settembre 2026 in poi. Prima si scende al giorno, dichiarandolo.
    const istante = rifiutata
      ? (r.rifiutato_il ?? null)
      : (ricevuta?.confermato_il ?? ricevuta?.data_incasso ?? null)

    const oraNota = rifiutata
      ? r.rifiutato_il != null
      : ricevuta?.confermato_il != null

    return {
      abbonamentoId: r.id,
      socioId: socio?.id ?? r.socio_id ?? null,
      socio: `${socio?.cognome ?? ''} ${socio?.nome ?? ''}`.trim() || 'Socio non trovato',
      attivita: attivita?.nome_attivita ?? 'Periodo di frequenza',
      annoSportivo: String(r.anno_sportivo ?? ''),
      esito: rifiutata ? 'rifiutata' : 'accettata',
      chi: rifiutata ? (r.rifiutato_da_nome ?? null) : (ricevuta?.operatore ?? null),
      quando: istante,
      oraNota,
      importo: rifiutata
        ? null
        : ricevuta?.importo_pagato != null
          ? Number(ricevuta.importo_pagato)
          : (attivita?.prezzo_base ?? 0) + Number(r.importo_tesseramento_uisp ?? 0),
      numeroRicevuta: rifiutata ? null : (ricevuta?.numero_ricevuta ?? null),
      motivoRifiuto: rifiutata ? (r.motivo_rifiuto ?? null) : null,
      richiestaIl: r.data_acquisto ?? null,
    }
  })

  // L'ordinamento si fa qui e non in query: le due date stanno in due tabelle
  // diverse, e nessuna colonna sola le contiene entrambe.
  decisioni.sort((a, b) => {
    if (!a.quando) return 1
    if (!b.quando) return -1
    return b.quando.localeCompare(a.quando)
  })

  return {
    decisioni: filtri.limite ? decisioni.slice(0, filtri.limite) : decisioni,
    errore: null,
  }
}

/**
 * Quando e' successo, scritto come lo direbbe una persona.
 *
 * Se l'ora non e' stata registrata si ferma al giorno invece di scrivere
 * "00:00", che sarebbe un orario inventato.
 */
export function quandoLeggibile(quando: string | null, oraNota: boolean): string {
  if (!quando) return 'data non registrata'
  const d = new Date(quando)
  if (Number.isNaN(d.getTime())) return 'data non registrata'

  const giorno = d.toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSO,
  })
  if (!oraNota) return giorno

  const ora = d.toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit', timeZone: FUSO,
  })
  return `${giorno}, ${ora}`
}
