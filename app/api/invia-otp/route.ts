import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Inizializza il postino con la tua chiave segreta
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { emailDestinatario, nome } = await req.json();

    if (!emailDestinatario) {
      return NextResponse.json({ error: 'Email mancante' }, { status: 400 });
    }

    // Genera l'OTP a 6 cifre
    const otpGenerato = Math.floor(100000 + Math.random() * 900000).toString();

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
        </div>
      `,
    });

    if (data.error) {
      console.error("Errore Resend:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      codiceOtp: otpGenerato 
    });

  } catch (error) {
    console.error("Errore generico API OTP:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}