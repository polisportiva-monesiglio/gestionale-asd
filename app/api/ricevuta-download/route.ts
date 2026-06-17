import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Non autorizzato', { status: 401 })

  // Supporta sia ?path=... (gestori) che ?abbonamento_id=... (soci e gestori)
  const explicitPath = req.nextUrl.searchParams.get('path')
  const abbonamentiId = req.nextUrl.searchParams.get('abbonamento_id')

  let storagePath: string | null = explicitPath

  if (abbonamentiId) {
    // Cerca la ricevuta per questo abbonamento
    const { data: ricevuta } = await supabase
      .from('pagamenti_ricevute')
      .select('url_ricevuta_pdf, abbonamento_id')
      .eq('abbonamento_id', abbonamentiId)
      .maybeSingle()

    if (!ricevuta?.url_ricevuta_pdf) return new NextResponse('Ricevuta non trovata', { status: 404 })
    storagePath = ricevuta.url_ricevuta_pdf

    // Verifica: gestore OPPURE socio proprietario dell'abbonamento
    const { data: gestore } = await supabase
      .from('gestori')
      .select('id')
      .eq('user_id', user.id)
      .eq('attivo', true)
      .maybeSingle()

    if (!gestore) {
      // Controlla che l'abbonamento appartenga al socio loggato
      const { data: ab } = await supabase
        .from('abbonamenti_soci')
        .select('soci(user_id)')
        .eq('id', abbonamentiId)
        .maybeSingle()

      const socioUserId = Array.isArray((ab as any)?.soci)
        ? (ab as any).soci[0]?.user_id
        : (ab as any)?.soci?.user_id

      if (socioUserId !== user.id) return new NextResponse('Accesso negato', { status: 403 })
    }
  } else if (explicitPath) {
    // Solo gestori possono usare path diretto
    const { data: gestore } = await supabase
      .from('gestori')
      .select('id')
      .eq('user_id', user.id)
      .eq('attivo', true)
      .maybeSingle()
    if (!gestore) return new NextResponse('Accesso negato', { status: 403 })
  } else {
    return new NextResponse('Parametro mancante', { status: 400 })
  }

  if (!storagePath) return new NextResponse('Ricevuta non trovata', { status: 404 })

  const { data, error } = await supabase.storage
    .from('ricevute')
    .createSignedUrl(storagePath, 3600)

  if (error || !data) return new NextResponse('Ricevuta non trovata', { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}
