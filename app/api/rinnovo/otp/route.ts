import { type NextRequest, NextResponse } from 'next/server'
import { ipDellaRichiesta } from '@/lib/ip'
import { emailPlausibile } from '@/lib/email'
import { firmatarioDi } from '@/lib/firmatario'
import { inviaCodiceFirma } from '@/lib/otp'
import { socioCheRinnova } from '@/lib/rinnovoServer'
import { datiRinnovo, leggiConsensi, leggiModifiche, consensiCompleti } from '@/lib/rinnovo'

/**
 * Spedisce il codice con cui si firma il rinnovo.
 *
 * A differenza della prima iscrizione, qui il contenuto da firmare **non
 * arriva dal browser**: il browser manda solo le correzioni ai recapiti e le
 * caselle spuntate, il resto lo mette il server leggendo la riga del socio.
 * Se l'identita' arrivasse dal client, basterebbe cambiarla per firmare un
 * modulo a nome di un altro, e un codice OTP - che dimostra il controllo di
 * una casella - non se ne accorgerebbe.
 */
export async function POST(req: NextRequest) {
  try {
    const corpo = await req.json()

    const accesso = await socioCheRinnova(corpo?.socioId)
    if (!accesso.ok) {
      return NextResponse.json({ error: accesso.errore }, { status: accesso.stato })
    }

    const consensi = leggiConsensi(corpo?.consensi)
    if (!consensiCompleti(consensi)) {
      return NextResponse.json(
        { error: 'Per rinnovare devi accettare tutte le dichiarazioni obbligatorie.' },
        { status: 400 }
      )
    }

    const dati = datiRinnovo(accesso.socio, leggiModifiche(corpo?.modifiche), consensi)
    const firmatario = firmatarioDi(dati)

    if (!emailPlausibile(firmatario.email)) {
      return NextResponse.json(
        {
          error: firmatario.minorenne
            ? "Per un socio minorenne serve l'email del genitore o di chi ne esercita la responsabilita'."
            : 'Manca un indirizzo email valido a cui spedire il codice.',
        },
        { status: 400 }
      )
    }

    const esito = await inviaCodiceFirma({
      email: firmatario.email,
      nome: firmatario.nome,
      dati,
      ip: ipDellaRichiesta(req),
      // Contatore separato da quello della prima iscrizione: i due percorsi
      // non si tolgono il budget a vicenda.
      ambito: 'rinnovo',
    })

    if (!esito.ok) {
      return NextResponse.json({ error: esito.errore }, { status: esito.stato })
    }

    return NextResponse.json({ success: true, token: esito.token, email: firmatario.email })
  } catch (error) {
    console.error('Errore generico OTP rinnovo:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
