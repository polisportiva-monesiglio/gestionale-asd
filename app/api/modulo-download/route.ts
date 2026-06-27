import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Non autorizzato', { status: 401 })

  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) return new NextResponse('Accesso negato', { status: 403 })

  const tesseramentoId = req.nextUrl.searchParams.get('tesseramento_id')
  if (!tesseramentoId) return new NextResponse('Parametro mancante', { status: 400 })

  const { data: tesseramento } = await supabase
    .from('tesseramenti_annuali')
    .select('url_modulo_firmato_pdf')
    .eq('id', tesseramentoId)
    .maybeSingle()

  if (!tesseramento?.url_modulo_firmato_pdf) return new NextResponse('Modulo non trovato', { status: 404 })

  const { data, error } = await supabase.storage
    .from('moduli-firmati')
    .createSignedUrl(tesseramento.url_modulo_firmato_pdf, 3600)

  if (error || !data) return new NextResponse('Modulo non trovato', { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}
