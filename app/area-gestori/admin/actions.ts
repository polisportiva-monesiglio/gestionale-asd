'use server'

import { createClient } from '@/lib/supabase/server'
import { normalizzaTelefono } from '@/lib/telefono'
import { revalidatePath } from 'next/cache'

export type AdminResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

async function getGestoreAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id, is_admin')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  if (!data?.is_admin) return null
  return { ...data, userId: user.id }
}

// Conta gli admin attivi diversi da escludiId: usato per impedire di
// disattivare/rimuovere/de-promuovere l'ultimo amministratore attivo,
// che lascerebbe il sistema senza nessuno in grado di gestire i gestori.
async function contaAltriAdminAttivi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  escludiId: string
) {
  const { count } = await supabase
    .from('gestori')
    .select('id', { count: 'exact', head: true })
    .eq('is_admin', true)
    .eq('attivo', true)
    .neq('id', escludiId)
  return count ?? 0
}

export async function invitaGestore(
  _prev: AdminResult | null,
  formData: FormData
): Promise<AdminResult> {
  const supabase = await createClient()
  const admin = await getGestoreAdmin(supabase)
  if (!admin) return { ok: false, error: 'Accesso non autorizzato.' }

  const email       = (formData.get('email')    as string | null)?.trim().toLowerCase()
  const nome        = (formData.get('nome')     as string | null)?.trim() || null
  const telefonoRaw = (formData.get('telefono') as string | null)?.trim() || ''
  if (!email) return { ok: false, error: 'Inserisci un\'email.' }

  const telefono = normalizzaTelefono(telefonoRaw)
  if (telefonoRaw && !telefono) {
    return { ok: false, error: 'Numero di telefono non valido.' }
  }

  const { error } = await supabase
    .from('gestori')
    .insert({ email, nome, telefono, attivo: true, is_admin: false })

  if (error) return { ok: false, error: `Inserimento fallito: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Gestore aggiunto. Potrà accedere registrandosi con questa email.' }
}

export async function aggiornaGestore(
  _prev: AdminResult | null,
  formData: FormData
): Promise<AdminResult> {
  const supabase = await createClient()
  const admin = await getGestoreAdmin(supabase)
  if (!admin) return { ok: false, error: 'Accesso non autorizzato.' }

  const id = formData.get('id') as string
  const campo = formData.get('campo') as 'attivo' | 'is_admin'
  const valore = formData.get('valore') === 'true'

  if (id === admin.id) return { ok: false, error: 'Non puoi modificare il tuo stesso account.' }
  if (!['attivo', 'is_admin'].includes(campo)) return { ok: false, error: 'Campo non valido.' }

  if (!valore) {
    const { data: target } = await supabase
      .from('gestori')
      .select('is_admin, attivo')
      .eq('id', id)
      .maybeSingle()

    const rimuoveUnAdminAttivo = target?.is_admin && target?.attivo
    if (rimuoveUnAdminAttivo) {
      const altriAdmin = await contaAltriAdminAttivi(supabase, id)
      if (altriAdmin === 0) {
        return { ok: false, error: 'Deve rimanere almeno un amministratore attivo: promuovi un altro gestore prima di procedere.' }
      }
    }
  }

  const { error } = await supabase
    .from('gestori')
    .update({ [campo]: valore })
    .eq('id', id)

  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Aggiornato.' }
}

export async function aggiornaDatiGestore(
  _prev: AdminResult | null,
  formData: FormData
): Promise<AdminResult> {
  const supabase = await createClient()
  const admin = await getGestoreAdmin(supabase)
  if (!admin) return { ok: false, error: 'Accesso non autorizzato.' }

  const id = formData.get('id') as string
  const nome = (formData.get('nome') as string | null)?.trim() || null
  const telefonoRaw = (formData.get('telefono') as string | null)?.trim() || ''

  const telefono = normalizzaTelefono(telefonoRaw)
  if (telefonoRaw && !telefono) {
    return { ok: false, error: 'Numero di telefono non valido.' }
  }

  const update: Record<string, string | null> = { nome, telefono }

  // L'email è la chiave di aggancio con l'account di login: modificabile
  // solo finché il gestore non ha ancora fatto il primo accesso.
  const emailRaw = formData.get('email') as string | null
  if (emailRaw !== null) {
    const { data: target } = await supabase
      .from('gestori')
      .select('user_id')
      .eq('id', id)
      .maybeSingle()
    if (target?.user_id) {
      return { ok: false, error: 'Email non modificabile dopo il primo accesso: rimuovi il gestore e ricrealo con la nuova email.' }
    }
    const email = emailRaw.trim().toLowerCase()
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return { ok: false, error: 'Email non valida.' }
    }
    update.email = email
  }

  const { error } = await supabase
    .from('gestori')
    .update(update)
    .eq('id', id)

  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Dati aggiornati.' }
}

export async function rimuoviGestore(
  _prev: AdminResult | null,
  formData: FormData
): Promise<AdminResult> {
  const supabase = await createClient()
  const admin = await getGestoreAdmin(supabase)
  if (!admin) return { ok: false, error: 'Accesso non autorizzato.' }

  const id = formData.get('id') as string
  if (id === admin.id) return { ok: false, error: 'Non puoi rimuovere il tuo stesso account.' }

  const { data: target } = await supabase
    .from('gestori')
    .select('is_admin, attivo')
    .eq('id', id)
    .maybeSingle()

  if (target?.is_admin && target?.attivo) {
    const altriAdmin = await contaAltriAdminAttivi(supabase, id)
    if (altriAdmin === 0) {
      return { ok: false, error: 'Deve rimanere almeno un amministratore attivo: promuovi un altro gestore prima di rimuovere questo account.' }
    }
  }

  const { error } = await supabase.from('gestori').delete().eq('id', id)
  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Gestore rimosso.' }
}
