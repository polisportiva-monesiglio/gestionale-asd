'use server'

import { createClient } from '@/lib/supabase/server'
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

export async function invitaGestore(
  _prev: AdminResult | null,
  formData: FormData
): Promise<AdminResult> {
  const supabase = await createClient()
  const admin = await getGestoreAdmin(supabase)
  if (!admin) return { ok: false, error: 'Accesso non autorizzato.' }

  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const nome = (formData.get('nome') as string | null)?.trim()
  if (!email) return { ok: false, error: 'Inserisci un\'email.' }

  const { error } = await supabase
    .from('gestori')
    .insert({ email, nome: nome || null, attivo: true, is_admin: false })

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

  const { error } = await supabase
    .from('gestori')
    .update({ [campo]: valore })
    .eq('id', id)

  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Aggiornato.' }
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

  const { error } = await supabase.from('gestori').delete().eq('id', id)
  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` }

  revalidatePath('/area-gestori/admin')
  return { ok: true, message: 'Gestore rimosso.' }
}
