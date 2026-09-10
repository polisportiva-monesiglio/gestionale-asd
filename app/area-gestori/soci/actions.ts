'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CAMPI, preparaCorrezioni } from '@/lib/correzioniSoci'

/**
 * La correzione dell'anagrafica di un socio, fatta da un gestore.
 *
 * Una server action è raggiungibile da chiunque sappia mandare la stessa POST:
 * il fatto che il pulsante si veda solo nell'area gestori non protegge niente.
 * Per questo qui si ricontrolla che chi scrive sia un gestore attivo, e i
 * campi ammessi sono un elenco chiuso — quello che arriva e non è in `CAMPI`
 * viene ignorato, non salvato.
 */

export type RisultatoCorrezione =
  | { ok: true; messaggio: string }
  | { ok: false; errore: string; perCampo?: Record<string, string> }

async function gestoreCorrente(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id, nome')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  return data ? { ...data, email: user.email } : null
}

export async function correggiAnagrafica(
  _prec: RisultatoCorrezione | null,
  formData: FormData
): Promise<RisultatoCorrezione> {
  const supabase = await createClient()
  const gestore = await gestoreCorrente(supabase)
  if (!gestore) return { ok: false, errore: 'Accesso non autorizzato.' }

  const socioId = String(formData.get('socio_id') ?? '')
  if (!socioId) return { ok: false, errore: 'Socio non indicato.' }

  const motivo = String(formData.get('motivo') ?? '').trim() || null

  // Si rilegge la riga adesso, non ci si fida di quella che il browser aveva
  // in pagina: fra l'apertura del modulo e il salvataggio può essere passato
  // un altro gestore, e il registro deve dire il valore da cui si è partiti
  // davvero, non quello che si vedeva a schermo.
  const { data: attuale, error: erroreLettura } = await supabase
    .from('soci')
    .select('*')
    .eq('id', socioId)
    .maybeSingle()

  if (erroreLettura) return { ok: false, errore: `Lettura del socio fallita: ${erroreLettura.message}` }
  if (!attuale) return { ok: false, errore: 'Socio non trovato.' }

  const richiesti: Record<string, string> = {}
  for (const campo of CAMPI) {
    const v = formData.get(campo.chiave)
    if (typeof v === 'string') richiesti[campo.chiave] = v
  }

  const esito = preparaCorrezioni(attuale as Record<string, unknown>, richiesti)
  if (!esito.ok) {
    return {
      ok: false,
      errore: 'Ci sono valori da sistemare.',
      perCampo: Object.fromEntries(esito.errori.map(e => [e.campo, e.messaggio])),
    }
  }

  if (esito.differenze.length === 0) {
    return { ok: true, messaggio: 'Nessuna modifica da salvare.' }
  }

  const { error: erroreScrittura } = await supabase
    .from('soci')
    .update(esito.valori)
    .eq('id', socioId)

  if (erroreScrittura) {
    // Il codice fiscale è unico in tabella: è l'errore che si prende
    // correggendo un codice mettendoci quello di un'altra persona già iscritta.
    if (erroreScrittura.message.includes('soci_cf_key')) {
      return {
        ok: false,
        errore: 'Questo codice fiscale appartiene già a un altro socio.',
        perCampo: { cf: 'Già presente in anagrafica.' },
      }
    }
    return { ok: false, errore: `Salvataggio fallito: ${erroreScrittura.message}` }
  }

  // Il registro si scrive **dopo** l'aggiornamento riuscito. Scritto prima,
  // un salvataggio fallito lascerebbe agli atti una correzione mai avvenuta —
  // peggio di non registrarla, perché sarebbe falsa.
  const { error: erroreRegistro } = await supabase.from('correzioni_anagrafica').insert(
    esito.differenze.map(d => ({
      socio_id: socioId,
      campo: d.campo,
      valore_precedente: d.prima,
      valore_nuovo: d.dopo,
      gestore_id: gestore.id,
      gestore_nome: gestore.nome ?? gestore.email ?? 'Gestore',
      motivo,
    }))
  )

  // Se salta il registro, la correzione resta: rifiutarla adesso vorrebbe dire
  // rimettere a mano i valori vecchi e rischiare di peggiorare. Si dice però
  // chiaramente, perché una correzione senza traccia è proprio la cosa che
  // questa funzione doveva evitare.
  if (erroreRegistro) {
    console.error('Registro delle correzioni fallito:', erroreRegistro.message)
    return {
      ok: true,
      messaggio: `Dati corretti, ma la traccia non è stata registrata (${erroreRegistro.message}). Segnalalo.`,
    }
  }

  revalidatePath('/area-gestori/soci')
  revalidatePath('/area-gestori')

  const quante = esito.differenze.length
  return {
    ok: true,
    messaggio: `${quante} ${quante === 1 ? 'campo corretto' : 'campi corretti'}: ${esito.differenze.map(d => d.etichetta.toLowerCase()).join(', ')}.`,
  }
}
