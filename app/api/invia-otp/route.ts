import { type NextRequest, NextResponse } from 'next/server';
import { ipDellaRichiesta } from '@/lib/ip';
import { emailPlausibile } from '@/lib/email';
import { firmatarioDi } from '@/lib/firmatario';
import { inviaCodiceFirma } from '@/lib/otp';

export async function POST(req: NextRequest) {
  try {
    const { dati } = await req.json();

    // Il destinatario lo decide il server, non il browser. Prima arrivava
    // gia' scelto dal client: bastava dichiararlo per far recapitare altrove
    // il codice che vale come firma. E soprattutto era una scelta diversa da
    // quella con cui /api/iscrizione poi verificava il codice.
    const firmatario = firmatarioDi(dati ?? {});

    if (!emailPlausibile(firmatario.email)) {
      return NextResponse.json(
        {
          error: firmatario.minorenne
            ? "Per un socio minorenne serve l'email del genitore o di chi ne esercita la responsabilita'."
            : 'Email mancante o non valida',
        },
        { status: 400 }
      );
    }

    // Generazione, tetto agli invii, spedizione e costruzione del token stanno
    // in lib/otp.ts: la stessa procedura serve al rinnovo annuale, e due copie
    // di un meccanismo di firma prima o poi divergono.
    const esito = await inviaCodiceFirma({
      email: firmatario.email,
      nome: firmatario.nome,
      dati: dati ?? {},
      ip: ipDellaRichiesta(req),
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.errore }, { status: esito.stato });
    }

    return NextResponse.json({ success: true, token: esito.token });
  } catch (error) {
    console.error("Errore generico API OTP:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
