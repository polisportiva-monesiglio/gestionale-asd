import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import crypto from 'crypto';
import { hashDatiFirma } from '@/lib/firmaHash';

// Inizializza il postino con la tua chiave segreta
const resend = new Resend(process.env.RESEND_API_KEY);

const DURATA_OTP_MS = 10 * 60 * 1000; // 10 minuti

export async function POST(req: Request) {
  try {
    const { emailDestinatario, nome, dati } = await req.json();

    if (!emailDestinatario) {
      return NextResponse.json({ error: 'Email mancante' }, { status: 400 });
    }

    const secret = process.env.OTP_SECRET;
    if (!secret) {
      console.error("OTP_SECRET non configurato");
      return NextResponse.json({ error: 'Configurazione del server incompleta' }, { status: 500 });
    }

    // Genera l'OTP a 6 cifre
    const otpGenerato = Math.floor(100000 + Math.random() * 900000).toString();
    const scadenza = Date.now() + DURATA_OTP_MS;

    // Hash del contenuto dichiarato al momento dell'invio: lega l'OTP ai dati
    // attuali, non solo all'email. Se i dati cambiano prima della conferma,
    // la verifica fallirà (vedi /api/verifica-otp).
    const datiHash = hashDatiFirma(dati ?? {});

    // Firma HMAC del codice: il client riceverà solo questo token, non l'OTP in chiaro
    const firma = crypto
      .createHmac('sha256', secret)
      .update(`${emailDestinatario}:${scadenza}:${otpGenerato}:${datiHash}`)
      .digest('hex');

    const token = Buffer.from(`${emailDestinatario}:${scadenza}:${firma}:${datiHash}`).toString('base64');

    // Spedisce la mail!
    const data = await resend.emails.send({
      from: 'Polisportiva Monesiglio <onboarding@resend.dev>', // IMPORTANTE: Lascia questo mittente finché sei nel piano gratuito!
      to: emailDestinatario, // L'email che l'utente ha inserito nel form
      subject: 'Codice OTP Tesseramento - ASD Monesiglio',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #facc15;">Polisportiva Monesiglio</h2>
          <p>Ciao ${nome || 'Socio'},</p>
          <p>Ecco il tuo codice OTP per firmare l'iscrizione:</p>
          <div style="background-color: #facc15; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; color: #111827;">
            ${otpGenerato}
          </div>
          <p style="font-size: 12px; color: #888; margin-top: 16px;">Il codice è valido per 10 minuti.</p>
        </div>
      `,
    });

    if (data.error) {
      console.error("Errore Resend:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      token,
    });

  } catch (error) {
    console.error("Errore generico API OTP:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
