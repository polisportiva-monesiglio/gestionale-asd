import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { contattoDi, linkWhatsApp, type DatiSocio } from '@/lib/contattiSocio'

/**
 * Apre WhatsApp verso chi ha fatto la richiesta, lasciando il segno del
 * contatto sulla richiesta stessa.
 *
 * Passa di qui e non da un pulsante con JavaScript: il segno serve a non
 * scrivere in due alla stessa persona, quindi deve valere **sempre**. Un
 * gestore con la pagina non ancora pronta, o che apre il collegamento in una
 * scheda nuova col tasto destro, aprirebbe WhatsApp senza lasciare traccia —
 * e un segno che a volte manca è peggio di nessun segno, perché ci si fida.
 *
 * Il messaggio lo compone il server: il numero e le date non passano
 * dall'indirizzo, che porta solo l'identificativo della richiesta.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<'/area-gestori/contatta/[id]'>) {
  const { id } = await ctx.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', _req.nextUrl))

  const { data: gestore } = await supabase
    .from('gestori')
    .select('id, nome')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) return NextResponse.redirect(new URL('/auth/non-autorizzato', _req.nextUrl))

  const { data: richiesta } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, stato_pagamento, data_inizio_validita, data_fine_validita,
      catalogo_attivita(nome_attivita),
      soci(nome, cognome, email, telefono, minorenne, genitore_nome, genitore_cognome, genitore_email, genitore_recapito)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!richiesta) return NextResponse.redirect(new URL('/area-gestori', _req.nextUrl))

  const socio = (Array.isArray(richiesta.soci) ? richiesta.soci[0] : richiesta.soci) as DatiSocio | null
  const attivitaRiga = Array.isArray(richiesta.catalogo_attivita)
    ? richiesta.catalogo_attivita[0]
    : richiesta.catalogo_attivita
  const attivita = (attivitaRiga as { nome_attivita?: string } | null)?.nome_attivita ?? 'Periodo di frequenza'

  const destinazione = socio
    ? linkWhatsApp(contattoDi(socio), attivita, {
        inizio: richiesta.data_inizio_validita,
        fine: richiesta.data_fine_validita,
      })
    : null

  if (!destinazione) return NextResponse.redirect(new URL('/area-gestori', _req.nextUrl))

  // Il segno vale solo finché c'è una decisione da prendere: su una richiesta
  // già confermata o rifiutata non serve a nessuno, e il gestore sta scrivendo
  // per altro.
  if (richiesta.stato_pagamento === 'da_saldare') {
    const { error } = await supabase
      .from('abbonamenti_soci')
      .update({
        contattato_il: new Date().toISOString(),
        contattato_da: gestore.id,
        contattato_da_nome: gestore.nome ?? user.email ?? 'Un gestore',
      })
      .eq('id', id)
      .eq('stato_pagamento', 'da_saldare')

    // Se il segno non si scrive, WhatsApp si apre lo stesso: l'annotazione non
    // vale un errore in faccia a chi sta per scrivere a un socio.
    if (error) console.error('Segno del contatto non riuscito:', error.message)
    else revalidatePath('/area-gestori')
  }

  return NextResponse.redirect(destinazione)
}
