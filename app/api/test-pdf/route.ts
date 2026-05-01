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
      luogoDataNascita: "15/04/2010, Torino (TO)",
      codiceFiscale: "RSSMRA10D15L219X",
      cittadinanza: "Italiana",
      
      // Residenza
      indirizzo: "Via Roma, 123",
      citta: "Monesiglio (CN)",
      
      // Contatti
      email: "mario.rossi@email.com",
      cellulare: "333 1234567",
      
      // Dati Genitore (Se è minorenne)
      nomeCognomeGenitore: "Giuseppe Rossi",
      cfGenitore: "RSSGPP80A01L219Y",
      
      // Varie
      luogoCompilazione: "Monesiglio",
      dataCompilazione: "27/04/2026",

      // Genitore (solo se minorenne)
      genitoreNome: "Giuseppe",
      genitoreCognome: "Rossi",
      genitoreContattoScelta: "Email", // O "Cellulare"
      genitoreContatto: "giuseppe.rossi@email.com"
    };

    // Dimensione base per i testi compilati
    const textSize = 12; 

    // ==========================================
    // 2. POSIZIONAMENTO CALCOLATO 
    // ==========================================
    
    // Intestazione
    // Anno Sportivo (vicino alla scritta "Anno Sportivo")
    firstPage.drawText(datiTest.annoSportivo, { x: 320, y: 539, size: 17, font });

    // Anno Sportivo nella richiesta prima dei dati anagrafici
    firstPage.drawText(datiTest.annoSportivo, { x: 230, y: 490, size: 12, font: fontObl });

    // Sezione 1: Dati Anagrafici
    // Riga 1: Nome e Cognome
    firstPage.drawText(datiTest.nomeCognome, { x: 210, y: 468, size: textSize, font });
    
    // Riga 2: Luogo, Data e Prov
    firstPage.drawText(datiTest.luogoDataNascita, { x: 240, y: 451, size: textSize, font });
    
    // Riga 3: Codice Fiscale
    firstPage.drawText(datiTest.codiceFiscale, { x: 191, y: 434, size: textSize, font });
    
    // Riga 4: Cittadinanza
    firstPage.drawText(datiTest.cittadinanza, { x: 182, y: 418, size: textSize, font });

    // Sezione 2: Residenza e Contatti
    // Riga 5: Via/Piazza
    firstPage.drawText(datiTest.indirizzo, { x: 247, y: 401, size: textSize, font });
    
    // Riga 6: Città e Prov
    firstPage.drawText(datiTest.citta, { x: 140, y: 385, size: textSize, font });

    // Riga 7: Email e Cellulare
    firstPage.drawText(datiTest.email, { x: 145, y: 369, size: textSize, font });
    firstPage.drawText(datiTest.cellulare, { x: 447, y: 369, size: textSize, font });

    // --- SEZIONE 3: DATI GENITORE (SOLO SE MINORENNE) ---
    // Nel tuo form React, quando l'età è < 18, compaiono e vengono inviati 'genitoreNome' e 'genitoreCognome'
    
    if (datiTest.genitoreNome && datiTest.genitoreCognome) {

      // 1. Scritta di avviso (TESSERATO MINORENNE) in grassetto
      firstPage.drawText("TESSERATO MINORENNE", { 
        x: 109, 
        y: 340, 
        size: 10, 
        font: fontBold 
      });

      // Stampiamo una piccola etichetta "Dati Genitore/Tutore:" seguita da Nome e Cognome
      const datiGenitore = `Genitore/Tutore: ${datiTest.genitoreNome} ${datiTest.genitoreCognome}`;
      
      // La posizioniamo nello spazio bianco sotto i contatti 
      firstPage.drawText(datiGenitore, { x: 109, y: 325, size: 11, font: fontBold });
      
      // Se nel form c'è anche il contatto del genitore, lo stampiamo sotto 
      if (datiTest.genitoreContatto) {
        const contattoGenitore = `Recapito Genitore (${datiTest.genitoreContattoScelta || 'Email'}): ${datiTest.genitoreContatto}`;
        firstPage.drawText(contattoGenitore, { x: 109, y: 310, size: textSize, font });
      }
    }

    // Sezione 4: Privacy, Data e Firme
    
    // Consenso Foto/Video (Facoltativo) - Lo posizioniamo sotto il paragrafo delle foto
    const consensoFoto = true; // Cambia a false per testare "NON ACCONSENTE"
    const testoConsenso = consensoFoto ? "ACCONSENTE all'uso delle immagini" : "NON ACCONSENTE all'uso delle immagini";
    firstPage.drawText(testoConsenso, { x: 71, y: 140, size: 10, font: fontBold }); 

    // Luogo e data in fondo (sulla riga apposita)
    const luogoData = `${datiTest.luogoCompilazione}, ${datiTest.dataCompilazione}`;
    firstPage.drawText(luogoData, { x: 148, y: 118, size: textSize, font });

    // Firma Elettronica (OTP) - Al posto dello scarabocchio a penna
    const codiceOTP = "847291";
    const dataOraFirma = "27/04/2026 14:30:15";
    const ipFirma = "192.168.1.100";
    
    // Creiamo un blocco testo a più righe per la validità legale
    const testoFirmaOTP = `Firma elettronica validata tramite OTP: ${codiceOTP}\nApposta il: ${dataOraFirma}\nIndirizzo IP: ${ipFirma}`;
    
    // Lo posizioniamo sulla riga "Firma del Socio (o Genitore):"
    firstPage.drawText(testoFirmaOTP, { 
      x: 230, 
      y: 102, 
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