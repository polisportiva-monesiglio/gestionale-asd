import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email, codice, token } = await req.json();

    if (!email || !codice || !token) {
      return NextResponse.json({ valid: false, error: 'Dati mancanti' }, { status: 400 });
    }

    const secret = process.env.OTP_SECRET;
    if (!secret) {
      console.error("OTP_SECRET non configurato");
      return NextResponse.json({ valid: false, error: 'Configurazione del server incompleta' }, { status: 500 });
    }

    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64').toString('utf-8');
    } catch {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }

    const parti = decoded.split(':');
    if (parti.length !== 3) {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }
    const [tokenEmail, scadenzaStr, firmaAttesa] = parti;
    const scadenza = Number(scadenzaStr);

    if (tokenEmail !== email || !Number.isFinite(scadenza)) {
      return NextResponse.json({ valid: false, error: 'Token non valido' }, { status: 400 });
    }

    if (Date.now() > scadenza) {
      return NextResponse.json({ valid: false, error: 'Il codice OTP è scaduto. Richiedine uno nuovo.' }, { status: 400 });
    }

    const firmaCalcolata = crypto
      .createHmac('sha256', secret)
      .update(`${email}:${scadenza}:${codice}`)
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

    // Hash di riferimento per l'audit trail (non rivela l'OTP in chiaro)
    const otpHash = crypto.createHash('sha256').update(`${email}:${scadenza}:${codice}`).digest('hex');

    return NextResponse.json({ valid: true, otpHash });

  } catch (error) {
    console.error("Errore verifica OTP:", error);
    return NextResponse.json({ valid: false, error: 'Errore interno del server' }, { status: 500 });
  }
}
