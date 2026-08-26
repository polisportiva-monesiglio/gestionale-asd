import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// I certificati vivono in due archivi diversi a seconda di dove sono stati
// caricati: `certificati_medici` (underscore) dal form pubblico di iscrizione,
// `certificati-medici` (trattino) dall'area socio. È un debito noto: finché
// non sono unificati, si cerca nell'uno e poi nell'altro.
const ARCHIVI = ['certificati-medici', 'certificati_medici'] as const

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
    .select('url_certificato_pdf')
    .eq('id', tesseramentoId)
    .maybeSingle()

  const percorso = tesseramento?.url_certificato_pdf
  if (!percorso) return new NextResponse('Certificato non caricato', { status: 404 })

  for (const archivio of ARCHIVI) {
    const { data } = await supabase.storage.from(archivio).createSignedUrl(percorso, 3600)
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl)
  }

  return new NextResponse('Certificato non trovato', { status: 404 })
}
