import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/non-autorizzato`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/non-autorizzato`)
  }

  const userId = data.user.id
  const email = data.user.email

  // Gestore?
  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (gestore) {
    await supabase.from('gestori').update({ user_id: userId }).eq('email', email).is('user_id', null)
    return NextResponse.redirect(`${origin}/area-gestori`)
  }

  // Socio?
  const { data: socio } = await supabase
    .from('soci')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (socio) {
    await supabase.from('soci').update({ user_id: userId }).eq('email', email).is('user_id', null)
    return NextResponse.redirect(`${origin}/area-socio`)
  }

  return NextResponse.redirect(`${origin}/auth/non-autorizzato`)
}
