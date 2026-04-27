// app/api/genera-pdf/route.ts
import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    // 1. Riceviamo i dati dal form
    const dati = await request.json();

    // 2. METODO SICURO PER FILE LOCALI IN NEXT.JS
    // Troviamo il file usando il percorso assoluto del sistema (senza fetch)
    const pdfPath = path.join(process.cwd(), 'public', 'template_iscrizione.pdf');
    
    // Leggiamo il file in modo sincrono e lo forziamo in Uint8Array
    const fileBuffer = fs.readFileSync(pdfPath);
    const existingPdfBytes = new Uint8Array(fileBuffer);

    // 3. Carichiamo il documento
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Prepariamo i font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Lavoriamo sulla prima pagina
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    
    const size = 11; // Grandezza del font
    const color = rgb(0.1, 0.1, 0.1); // Grigio scuro

    // --- CALCOLO AUTOMATICO ANNO SPORTIVO ---
    const oggi = new Date();
    const meseCorrente = oggi.getMonth() + 1;
    const annoCorrente = oggi.getFullYear();
    
    let annoSportivo = '';
    if (meseCorrente < 9) {
      annoSportivo = `${annoCorrente - 1}/${annoCorrente}`;
    } else {
      annoSportivo = `${annoCorrente}/${annoCorrente + 1}`;
    }

    // --- SCRITTURA DEI DATI SUL PDF ---
    // x = sinistra verso destra | y = dal basso verso l'alto
    firstPage.drawText(annoSportivo, { x: 380, y: 615, size: 14, font: fontBold, color });

    firstPage.drawText(`${dati.nome} ${dati.cognome}`, { x: 230, y: 495, size, font: fontBold, color });
    
    const dataNascitaFormattata = new Date(dati.dataNascita).toLocaleDateString('it-IT');
    firstPage.drawText(`${dati.luogoNascita} il ${dataNascitaFormattata}`, { x: 260, y: 472, size, font, color });
    firstPage.drawText(dati.provinciaNascita, { x: 440, y: 472, size, font, color });
    
    firstPage.drawText(dati.codiceFiscale.toUpperCase(), { x: 200, y: 449, size, font, color });
    firstPage.drawText(dati.cittadinanza, { x: 200, y: 426, size, font, color });
    
    firstPage.drawText(dati.indirizzoResidenza, { x: 260, y: 403, size, font, color });
    firstPage.drawText(dati.cittaResidenza, { x: 140, y: 380, size, font, color });
    firstPage.drawText(dati.provinciaResidenza, { x: 440, y: 380, size, font, color });
    
    firstPage.drawText(dati.email, { x: 140, y: 357, size, font, color });
    firstPage.drawText(dati.telefono, { x: 460, y: 357, size, font, color });

    if (dati.minorenne) {
      firstPage.drawText(`Il/La minore è iscritto/a dal genitore/tutore: ${dati.genitoreNome} ${dati.genitoreCognome}`, { 
        x: 60, y: 330, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) 
      });
    }

    // --- TIMBRO LEGALE E FIRMA OTP ---
    const dataOggi = new Date().toLocaleDateString('it-IT');
    
    firstPage.drawText(`Monesiglio, ${dataOggi}`, { x: 180, y: 108, size, font: fontBold, color });
    
    const testoFirma = `Firmato digitalmente tramite OTP: [${dati.otp}]`;
    firstPage.drawText(testoFirma, { x: 230, y: 85, size: 11, font: fontBold, color: rgb(0, 0.4, 0.8) });
    
    const testoLegale = `IP: ${dati.ip || 'Sconosciuto'} - Data: ${dataOggi}`;
    firstPage.drawText(testoLegale, { x: 230, y: 70, size: 8, font, color: rgb(0.4, 0.4, 0.4) });

    if (dati.consensoPrivacy === false) {
      firstPage.drawText("NEGA CONSENSO", { x: 430, y: 150, size: 10, font: fontBold, color: rgb(0.8, 0, 0) });
    }

    // 4. Chiudiamo e salviamo
    const pdfBytes = await pdfDoc.save();

    // 5. Restituiamo il file
    const pdfBuffer = Buffer.from(pdfBytes);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length.toString(),
        'Content-Disposition': `attachment; filename="Iscrizione_${dati.cognome}_${dati.nome}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Errore generazione PDF:', error);
    return NextResponse.json({ error: 'Errore: ' + error.message }, { status: 500 });
  }
}