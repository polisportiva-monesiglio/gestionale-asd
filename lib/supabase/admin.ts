import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Client con la chiave di servizio: ignora le RLS.
 *
 * Serve al solo percorso dell'iscrizione pubblica, dove il browser non deve
 * poter scrivere direttamente: la chiave anonima non ha più il permesso di
 * inserire in `soci` e `tesseramenti_annuali`, così l'unica strada per creare
 * un tesseramento firmato passa dal server, che prima verifica l'OTP.
 *
 * L'import di `server-only` fa fallire la compilazione se questo modulo
 * finisce, anche indirettamente, in un componente client: la chiave di
 * servizio nel bundle del browser darebbe a chiunque pieno accesso al
 * database.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiaveServizio = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !chiaveServizio) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY non configurata: il percorso di iscrizione non può scrivere.'
    )
  }

  return createSupabaseClient(url, chiaveServizio, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
