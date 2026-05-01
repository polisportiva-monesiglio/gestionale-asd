import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    // 1. Estrae i dati reali inviati dal form web (frontend)
    const dati = await req.json();

    // 2. Carica il template base del PDF dalla cartella public
    const templatePath = path.join(process.cwd(), 'public', 'template_iscrizione.pdf');
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // 3. Imposta i font (Helvetica, HelveticaOblique, HelveticaBold)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontObl = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // ==========================================
    // POSIZIONAMENTO DATI REALI NEL PDF
    // ==========================================
    const textSize = 12; 

    // --- INTESTAZIONE (Anno Sportivo) ---
    const oggi = new Date();
    const mese = oggi.getMonth(); // 0 = Gennaio, 7 = Agosto
    const annoCorrente = oggi.getFullYear();
    
    let annoSportivoDinamico = "";
    if (mese < 7) { 
      annoSportivoDinamico = `${annoCorrente - 1}/${annoCorrente}`;
    } else {
      annoSportivoDinamico = `${annoCorrente}/${annoCorrente + 1}`;
    }
    const annoSportivo = dati.annoSportivo || annoSportivoDinamico;
    
    // Anno Sportivo (vicino alla scritta "Anno Sportivo")
    firstPage.drawText(annoSportivo, { x: 320, y: 539, size: 17, font });
    // Anno Sportivo nella richiesta prima dei dati anagrafici
    firstPage.drawText(annoSportivo, { x: 230, y: 490, size: 12, font: fontObl });

    // --- SEZIONE 1: DATI ANAGRAFICI ---
    // Riga 1: Nome e Cognome
    const nomeCognome = `${dati.nome || ''} ${dati.cognome || ''}`.trim();
    firstPage.drawText(nomeCognome, { x: 210, y: 468, size: textSize, font });
    
    // Riga 2: Data, Luogo e Prov (Es: 15/04/2010, Torino (TO))
    let dataNascitaFormattata = dati.dataNascita || '';
    if (dataNascitaFormattata.includes('-')) {
      const [anno, mese, giorno] = dataNascitaFormattata.split('-');
      dataNascitaFormattata = `${giorno}/${mese}/${anno}`;
    }
    const luogoDataNascita = `${dataNascitaFormattata}, ${dati.luogoNascita || ''} (${dati.provinciaNascita || ''})`;
    firstPage.drawText(luogoDataNascita, { x: 240, y: 451, size: textSize, font });
    
    // Riga 3: Codice Fiscale
    firstPage.drawText(dati.codiceFiscale || '', { x: 191, y: 434, size: textSize, font });
    
    // Riga 4: Cittadinanza
    const cittadinanza = dati.cittadinanza || "Italiana";
    firstPage.drawText(cittadinanza, { x: 182, y: 418, size: textSize, font });

    // --- SEZIONE 2: RESIDENZA E CONTATTI ---
    // Riga 5: Via/Piazza
    firstPage.drawText(dati.indirizzoResidenza || '', { x: 247, y: 401, size: textSize, font });
    
    // Riga 6: Città e Prov
    const cittaCompleta = `${dati.cittaResidenza || ''} (${dati.provinciaResidenza || ''})`;
    firstPage.drawText(cittaCompleta, { x: 140, y: 385, size: textSize, font });

    // Riga 7: Email e Telefono/Cellulare
    firstPage.drawText(dati.email || '', { x: 145, y: 369, size: textSize, font });
    const numeroTel = dati.telefono || dati.tel || dati.cellulare || '';
    firstPage.drawText(numeroTel, { x: 447, y: 369, size: textSize, font });

    // --- SEZIONE 3: DATI GENITORE (SOLO SE MINORENNE) ---
    if (dati.genitoreNome && dati.genitoreCognome) {
      // 1. Scritta di avviso (TESSERATO MINORENNE) in grassetto
      firstPage.drawText("TESSERATO MINORENNE", { x: 109, y: 340, size: 10, font: fontBold });

      // 2. Dati Genitore
      const datiGenitore = `Genitore/Tutore: ${dati.genitoreNome} ${dati.genitoreCognome}`;
      firstPage.drawText(datiGenitore, { x: 109, y: 325, size: 11, font: fontBold });
      
      // 3. Recapito Genitore
      if (dati.genitoreContatto) {
        const contattoGenitore = `Recapito Genitore (${dati.genitoreContattoScelta || 'Email'}): ${dati.genitoreContatto}`;
        firstPage.drawText(contattoGenitore, { x: 109, y: 310, size: textSize, font });
      }
    }

    // --- SEZIONE 4: PRIVACY, DATA E FIRME ---
    // Consenso Foto/Video (Facoltativo)
    const haAcconsentito = 
      dati.consensoPrivacy === true || 
      dati.consensoPrivacy === "true" || 
      dati.consensoPrivacy === "on";
      
    const testoConsenso = haAcconsentito 
      ? "ACCONSENTE all'uso delle immagini" 
      : "NON ACCONSENTE all'uso delle immagini";
    firstPage.drawText(testoConsenso, { x: 71, y: 140, size: 10, font: fontBold }); 

    // Luogo e data in fondo
    const dataOdierna = new Date().toLocaleDateString('it-IT');
    const luogoCompilazione = dati.cittaResidenza || "Monesiglio";
    const luogoData = `${luogoCompilazione}, ${dataOdierna}`;
    firstPage.drawText(luogoData, { x: 148, y: 118, size: textSize, font });

    // Firma Elettronica (OTP)
    const codiceOTP = dati.otp || "Non fornito";
    const ipFirma = dati.ip || "IP non tracciato";
    const dataOraFirma = new Date().toLocaleString('it-IT');
    
    const testoFirmaOTP = `Firma elettronica validata tramite OTP: ${codiceOTP}\nApposta il: ${dataOraFirma}\nIndirizzo IP: ${ipFirma}`;
    
    firstPage.drawText(testoFirmaOTP, { 
      x: 230, 
      y: 102, 
      size: 9, 
      font: font,
      lineHeight: 12 
    });
    // ==========================================

    // 4. Salva e restituisce il PDF finale
    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Iscrizione_${dati.cognome || 'Socio'}.pdf"`,
      },
    });

  } catch (error) {
    console.error('Errore nella generazione del PDF:', error);
    return new Response(JSON.stringify({ error: 'Errore durante la generazione del documento' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}