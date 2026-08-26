import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Archivio unico dal 26/08/2026: i certificati dell'iscrizione stanno sotto
// `iscrizioni/`, quelli caricati dall'area socio sotto l'id utente.
const ARCHIVIO = 'certificati-medici'

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

  const { data } = await supabase.storage.from(ARCHIVIO).createSignedUrl(percorso, 3600)
  if (!data?.signedUrl) return new NextResponse('Certificato non trovato', { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}
