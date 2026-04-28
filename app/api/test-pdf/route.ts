export const dynamic = 'force-dynamic';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const templatePath = path.join(process.cwd(), 'public', 'template_iscrizione.pdf');
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Usa Helvetica come "controfigura" di Roboto per il test veloce
    // (Oppure usa la logica del fontkit se hai già caricato il .ttf)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontObl = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // ==========================================
    // 1. TUTTI I DATI DI TEST POSSIBILI
    // ==========================================
    const datiTest = {
      annoSportivo: "2026/2027",
      
      // Dati Anagrafici (Utente o Minore)
      nomeCognome: "Mario Rossi",
      luogoNascita: "Torino",
      dataNascita: "15/04/2010",
      provNascita: "TO",
      codiceFiscale: "RSSMRA10D15L219X",
      cittadinanza: "Italiana",
      
      // Residenza
      indirizzo: "Via Roma, 123",
      citta: "Monesiglio",
      provResidenza: "CN",
      cap: "12077",
      
      // Contatti
      email: "mario.rossi@email.com",
      cellulare: "333 1234567",
      
      // Dati Genitore (Se è minorenne)
      nomeCognomeGenitore: "Giuseppe Rossi",
      cfGenitore: "RSSGPP80A01L219Y",
      
      // Varie
      luogoCompilazione: "Monesiglio",
      dataCompilazione: "27/04/2026",
    };

    // Dimensione base per i testi compilati
    const textSize = 12; 

        // ==========================================
    // 2. POSIZIONAMENTO CALCOLATO 
    // ==========================================
    
    // Intestazione
    // Anno Sportivo (vicino alla scritta "Anno Sportivo")
    firstPage.drawText(datiTest.annoSportivo, { x: 323, y: 539, size: 17, font });

    // Anno Sportivo nella richiesta prima dei dati anagrafici
    firstPage.drawText(datiTest.annoSportivo, { x: 231, y: 464, size: 12, font: fontObl });

    // Sezione 1: Dati Anagrafici
    // Riga 1: Nome e Cognome
    firstPage.drawText(datiTest.nomeCognome, { x: 190, y: 432, size: textSize, font });
    
    // Riga 2: Luogo, Data e Prov
    firstPage.drawText(datiTest.luogoNascita, { x: 215, y: 412, size: textSize, font });
    firstPage.drawText(datiTest.dataNascita, { x: 420, y: 412, size: textSize, font });
    firstPage.drawText(datiTest.provNascita, { x: 505, y: 412, size: textSize, font });
    
    // Riga 3: Codice Fiscale
    firstPage.drawText(datiTest.codiceFiscale, { x: 190, y: 393, size: textSize, font });
    
    // Riga 4: Cittadinanza
    firstPage.drawText(datiTest.cittadinanza, { x: 190, y: 373, size: textSize, font });

    // Sezione 2: Residenza e Contatti
    // Riga 5: Via/Piazza
    firstPage.drawText(datiTest.indirizzo, { x: 230, y: 353, size: textSize, font });
    
    // Riga 6: Città e Prov
    firstPage.drawText(datiTest.citta, { x: 155, y: 333, size: textSize, font });
    // Ho stimato che ci sia un CAP da qualche parte, ma nel tuo modulo c'è solo "Prov:"
    firstPage.drawText(datiTest.provResidenza, { x: 440, y: 333, size: textSize, font });

    // Riga 7: Email e Cellulare
    firstPage.drawText(datiTest.email, { x: 160, y: 313, size: textSize, font });
    firstPage.drawText(datiTest.cellulare, { x: 440, y: 313, size: textSize, font });

        // Sezione 4: Privacy, Data e Firme
    
    // Consenso Foto/Video (Facoltativo) - Lo posizioniamo sotto il paragrafo delle foto
    const consensoFoto = true; // Cambia a false per testare "NON ACCONSENTE"
    const testoConsenso = consensoFoto ? "ACCONSENTE all'uso delle immagini" : "NON ACCONSENTE all'uso delle immagini";
    firstPage.drawText(testoConsenso, { x: 85, y: 195, size: 10, font: fontBold }); 

    // Luogo e data in fondo (sulla riga apposita)
    const luogoData = `${datiTest.luogoCompilazione}, ${datiTest.dataCompilazione}`;
    firstPage.drawText(luogoData, { x: 170, y: 155, size: textSize, font });

    // Firma Elettronica (OTP) - Al posto dello scarabocchio a penna
    const codiceOTP = "847291";
    const dataOraFirma = "27/04/2026 14:30:15";
    const ipFirma = "192.168.1.100";
    
    // Creiamo un blocco testo a più righe per la validità legale
    const testoFirmaOTP = `Firma elettronica validata tramite OTP: ${codiceOTP}\nApposta il: ${dataOraFirma}\nIndirizzo IP: ${ipFirma}`;
    
    // Lo posizioniamo sulla riga "Firma del Socio (o Genitore):"
    firstPage.drawText(testoFirmaOTP, { 
      x: 250, 
      y: 140, // Partiamo leggermente più in alto perché sono 3 righe
      size: 9, 
      font: font,
      lineHeight: 12 // Spazio tra una riga e l'altra
    });

    // ==========================================

    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="test.pdf"',
      },
    });
    
  } catch (error) {
    console.error('Errore test PDF:', error);
    return new Response(JSON.stringify({ error: 'Errore' }), { status: 500 });
  }
}