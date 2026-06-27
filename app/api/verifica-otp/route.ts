import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { hashDatiFirma } from '@/lib/firmaHash';

const MAX_TENTATIVI = 5;

export async function POST(req: Request) {
  try {
    const { email, codice, token, dati } = await req.json();

    if (!email || !codice || !token) {
      return NextResponse.json({ valid: false, error: 'Dati mancanti' }, { status: 400 });
    }

    const secret = process.env.OTP_SECRET;
    if (!secret) {
      console.error("OTP_SECRET non configurato");
      return NextResponse.json({ valid: false, error: 'Configurazione del server incompleta' }, { status: 500 });
    }

    // Rate limit: max MAX_TENTATIVI verifiche per token, per bloccare il brute force sulle 6 cifre
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: tentativi, error: tentativiErr } = await supabase
      .rpc('incrementa_tentativo_otp', { p_token_hash: tokenHash })

    if (tentativiErr) {
      console.error("Errore rate limit OTP:", tentativiErr);
      return NextResponse.json({ valid: false, error: 'Errore interno del server' }, { status: 500 });
    }

    if ((tentativi ?? 0) > MAX_TENTATIVI) {
      return NextResponse.json({ valid: false, error: 'Troppi tentativi falliti. Richiedi un nuovo codice OTP.' }, { status: 429 });
    }

    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64').toString('utf-8');
    } catch {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }

    const parti = decoded.split(':');
    if (parti.length !== 4) {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }
    const [tokenEmail, scadenzaStr, firmaAttesa, datiHashToken] = parti;
    const scadenza = Number(scadenzaStr);

    if (tokenEmail !== email || !Number.isFinite(scadenza)) {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }

    if (Date.now() > scadenza) {
      return NextResponse.json({ valid: false, error: 'Il codice OTP è scaduto. Richiedine uno nuovo.' }, { status: 400 });
    }

    const firmaCalcolata = crypto
      .createHmac('sha256', secret)
      .update(`${email}:${scadenza}:${codice}:${datiHashToken}`)
      .digest('hex');

    if (firmaAttesa.length !== firmaCalcolata.length) {
      return NextResponse.json({ valid: false, error: 'Codice OTP non corretto' }, { status: 400 });
    }

    const valido = crypto.timingSafeEqual(
      Buffer.from(firmaAttesa, 'hex'),
      Buffer.from(firmaCalcolata, 'hex')
    );

    if (!valido) {
      return NextResponse.json({ valid: false, error: 'Codice OTP non corretto' }, { status: 400 });
    }

    // I dati dichiarati devono essere identici a quelli presenti al momento
    // dell'invio dell'OTP: se l'utente torna indietro e modifica anagrafica
    // o consensi dopo aver richiesto il codice, la firma non è più valida
    // per il nuovo contenuto e va richiesto un nuovo OTP.
    const datiHashAttuale = hashDatiFirma(dati ?? {});
    if (datiHashAttuale !== datiHashToken) {
      return NextResponse.json({
        valid: false,
        error: 'I dati inseriti sono cambiati rispetto alla richiesta del codice OTP. Richiedi un nuovo codice.',
      }, { status: 400 });
    }

    // Verifica riuscita: azzera il contatore tentativi per questo token
    await supabase.rpc('azzera_tentativi_otp', { p_token_hash: tokenHash })

    // Hash di riferimento per l'audit trail (non rivela l'OTP in chiaro)
    const otpHash = crypto.createHash('sha256').update(`${email}:${scadenza}:${codice}`).digest('hex');

    return NextResponse.json({ valid: true, otpHash });

  } catch (error) {
    console.error("Errore verifica OTP:", error);
    return NextResponse.json({ valid: false, error: 'Errore interno del server' }, { status: 500 });
  }
}
