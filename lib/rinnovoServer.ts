import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnnoSportivo } from '@/lib/stagione'
import type { SocioPerRinnovo } from '@/lib/rinnovo'

/**
 * Chi sta rinnovando, e se ha diritto di farlo adesso.
 *
 * Lo stesso controllo serve alla rotta che spedisce il codice e a quella che
 * riceve la firma. Vive qui perché fra le due non deve poterci essere
 * scarto: se la prima accettasse un socio che la seconda rifiuta, il codice
 * partirebbe per una firma impossibile.
 */
export type EsitoAccesso =
  | { ok: true; socio: SocioPerRinnovo; annoSportivo: string }
  | { ok: false; errore: string; stato: number }

const CAMPI_SOCIO =
  'id, nome, cognome, sesso, cf, data_nascita, luogo_nascita, provincia_nascita, ' +
  'cittadinanza, indirizzo, cap, citta, provincia_residenza, telefono, email, ' +
  'genitore_nome, genitore_cognome, genitore_email, genitore_contatto_preferito, genitore_recapito'

export async function socioCheRinnova(socioId: unknown): Promise<EsitoAccesso> {
  if (typeof socioId !== 'string' || socioId.length === 0) {
    return { ok: false, errore: 'Manca la persona per cui rinnovare.', stato: 400 }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, errore: 'Sessione scaduta. Effettua di nuovo il login.', stato: 401 }
  }

  // La riga si legge con la sessione del socio, non con la chiave di servizio:
  // così è la RLS a stabilire che sia davvero sua, e non un controllo che
  // potrei scrivere storto. `socio_id` arriva da un campo del modulo.
  const { data: socio, error } = await supabase
    .from('soci')
    .select(CAMPI_SOCIO)
    .eq('id', socioId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Lettura del socio per il rinnovo fallita:', error.message)
    return { ok: false, errore: 'Errore interno del server', stato: 500 }
  }
  if (!socio) {
    return { ok: false, errore: 'Profilo socio non trovato.', stato: 403 }
  }

  // L'elenco delle colonne e' una stringa composta, quindi i tipi generati da
  // Supabase non sanno che forma abbia la riga: la si dichiara qui, una volta.
  const riga = socio as unknown as SocioPerRinnovo

  const annoSportivo = getAnnoSportivo()

  // Un tesseramento per stagione. Il controllo è qui per poter dire al socio
  // che cosa è successo; la garanzia vera è l'indice unico sulla tabella, che
  // regge anche due invii nello stesso istante.
  const admin = createAdminClient()
  const { data: gia, error: erroreGia } = await admin
    .from('tesseramenti_annuali')
    .select('id')
    .eq('socio_id', riga.id)
    .eq('anno_sportivo', annoSportivo)
    .maybeSingle()

  if (erroreGia) {
    console.error('Controllo del tesseramento esistente fallito:', erroreGia.message)
    return { ok: false, errore: 'Errore interno del server', stato: 500 }
  }
  if (gia) {
    return {
      ok: false,
      errore: `Il tesseramento per la stagione ${annoSportivo} risulta già firmato.`,
      stato: 409,
    }
  }

  return { ok: true, socio: riga, annoSportivo }
}

/**
 * Il certificato medico ancora valido che il socio ha già in archivio.
 *
 * Al rinnovo non ha senso farne ricaricare uno che è ancora buono: il file è
 * già lì e la scadenza pure. Si guarda lo storico, che è la tabella che
 * conserva tutti i certificati caricati, non solo quello della stagione in
 * corso.
 */
export async function certificatoAncoraValido(
  socioId: string,
  oggi: string
): Promise<{ percorso: string; scadenza: string } | null> {
  const admin = createAdminClient()

  // Si guardano tutte e due le tabelle. Lo storico raccoglie i certificati
  // caricati dall'area personale, ma quello allegato alla prima iscrizione
  // finisce solo sul tesseramento: cercandolo in un posto solo, chi si e'
  // iscritto quest'anno si sentirebbe dire di ricaricare un certificato che
  // ha gia' consegnato.
  const [storico, tesseramenti] = await Promise.all([
    admin
      .from('certificati_medici_storico')
      .select('url_certificato_pdf, data_scadenza_certificato')
      .eq('socio_id', socioId)
      .not('url_certificato_pdf', 'is', null)
      .gte('data_scadenza_certificato', oggi),
    admin
      .from('tesseramenti_annuali')
      .select('url_certificato_pdf, data_scadenza_certificato')
      .eq('socio_id', socioId)
      .not('url_certificato_pdf', 'is', null)
      .gte('data_scadenza_certificato', oggi),
  ])

  if (storico.error || tesseramenti.error) {
    console.error(
      'Ricerca del certificato valido fallita:',
      storico.error?.message ?? tesseramenti.error?.message
    )
    return null
  }

  const candidati = [...(storico.data ?? []), ...(tesseramenti.data ?? [])]
    .filter(r => r.url_certificato_pdf && r.data_scadenza_certificato)
    .sort((a, b) =>
      String(b.data_scadenza_certificato).localeCompare(String(a.data_scadenza_certificato))
    )

  const riga = candidati[0]
  if (!riga) return null
  return {
    percorso: String(riga.url_certificato_pdf),
    scadenza: String(riga.data_scadenza_certificato),
  }
}
