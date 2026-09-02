/**
 * Il permesso di caricare un certificato, chiesto al server e ricordato.
 *
 * Sta qui e non dentro un componente perché i percorsi che caricano sono due,
 * la prima iscrizione e il rinnovo annuale, ed erano destinati a diventare due
 * copie della stessa procedura. Due copie divergono: è già successo con la
 * firma, quando l'indirizzo a cui spedire il codice era scelto da una parte e
 * verificato dall'altra.
 *
 * Il permesso costa uno slot del limitatore, che ne concede dieci all'ora per
 * provenienza. Se il caricamento si interrompe — rete mobile che cade a metà —
 * e la persona riprova, chiederne un altro brucerebbe un secondo slot per lo
 * stesso file: dopo dieci tentativi a vuoto si sentirebbe dire che ha caricato
 * troppo, senza aver caricato niente. Il permesso vale per un percorso solo ma
 * per un paio d'ore, quindi riusarlo sullo stesso file è esattamente ciò per
 * cui è fatto.
 */

export type PermessoRicordato = { file: File; percorso: string; token: string } | null

export async function permessoDiCaricare(
  file: File,
  memoria: { current: PermessoRicordato }
): Promise<{ percorso: string; token: string }> {
  if (memoria.current && memoria.current.file === file) {
    return { percorso: memoria.current.percorso, token: memoria.current.token }
  }

  const estensione = file.name.split('.').pop()?.toLowerCase() ?? ''

  const risposta = await fetch('/api/certificato-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Il tipo dichiarato dal browser serve da ripiego quando il nome del file
    // non porta un'estensione riconoscibile: capita con gli allegati salvati da
    // certe app di messaggistica, che arrivano chiamati solo «certificato».
    body: JSON.stringify({ estensione, tipo: file.type }),
  })

  const rilascio = await risposta.json()
  if (!risposta.ok) {
    throw new Error(rilascio?.error || 'Caricamento del certificato non riuscito.')
  }

  memoria.current = { file, percorso: rilascio.percorso, token: rilascio.token }
  return { percorso: rilascio.percorso, token: rilascio.token }
}
