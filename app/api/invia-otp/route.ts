// app/api/invia-otp/route.ts
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    // 1. Leggiamo a chi dobbiamo mandare l'email
    const body = await request.json();
    const { emailDestinatario, nome } = body;

    if (!emailDestinatario) {
      return NextResponse.json({ error: 'Email mancante' }, { status: 400 });
    }

    // 2. Generiamo un codice OTP di 6 cifre casuale
    const codiceOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Prepariamo il "postino" con i dati di Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 4. Creiamo il contenuto della email
    const mailOptions = {
      from: `"ASD Polisportiva Monesiglio" <${process.env.EMAIL_USER}>`,
      to: emailDestinatario,
      subject: 'Il tuo Codice di Firma - Iscrizione ASD',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Codice di Sicurezza (OTP)</h2>
          <p style="color: #555; font-size: 16px;">Ciao <strong>${nome || 'Atleta'}</strong>,</p>
          <p style="color: #555; font-size: 16px;">Usa il codice qui sotto per firmare digitalmente il tuo modulo di iscrizione alla Polisportiva Monesiglio.</p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #FBBF24; padding: 20px; text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111;">${codiceOtp}</span>
          </div>
          
          <p style="color: #888; font-size: 14px;"><em>Se non hai richiesto questo codice, ignora questa email.</em></p>
        </div>
      `,
    };

    // 5. Spediamo!
    await transporter.sendMail(mailOptions);

    // 6. Restituiamo il codice generato al nostro sito (così sa cosa controllare)
    return NextResponse.json({ success: true, codiceOtp });

  } catch (error: any) {
    console.error('Errore invio email:', error);
    return NextResponse.json({ error: 'Errore durante l\'invio dell\'email' }, { status: 500 });
  }
}