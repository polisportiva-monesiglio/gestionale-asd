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

        // Intestazione (Anno Sportivo Calcolato Automaticamente)
    // Se il mese è da Gennaio (0) a Luglio (6), la stagione è "AnnoPrecedente/AnnoCorrente"
    // Se il mese è da Agosto (7) a Dicembre (11), la stagione è "AnnoCorrente/AnnoSuccessivo"
    const oggi = new Date();
    const mese = oggi.getMonth(); // 0 = Gennaio, 7 = Agosto
    const annoCorrente = oggi.getFullYear();
    
    let annoSportivoDinamico = "";
    if (mese < 7) { 
      // Fino a Luglio (es. Aprile 2026 -> 2025/2026)
      annoSportivoDinamico = `${annoCorrente - 1}/${annoCorrente}`;
    } else {
      // Da Agosto in poi (es. Agosto 2026 -> 2026/2027)
      annoSportivoDinamico = `${annoCorrente}/${annoCorrente + 1}`;
    }

    // Se dal form (dati) viene forzato un anno, usiamo quello, altrimenti usiamo il calcolatore dinamico
    const annoSportivo = dati.annoSportivo || annoSportivoDinamico;
    
    // Anno Sportivo (vicino alla scritta "Anno Sportivo")
    firstPage.drawText(annoSportivo, { x: 320, y: 539, size: 17, font });
    // Anno Sportivo nella richiesta prima dei dati anagrafici
    firstPage.drawText(annoSportivo, { x: 230, y: 464, size: 12, font: fontObl });

    // --- SEZIONE 1: DATI ANAGRAFICI ---
    // Riga 1: Nome e Cognome
    const nomeCognome = `${dati.nome || ''} ${dati.cognome || ''}`.trim();
    firstPage.drawText(nomeCognome, { x: 210, y: 441, size: textSize, font });
    
    // Riga 2: Luogo, Data e Prov di Nascita
    let dataNascitaFormattata = dati.dataNascita || '';
    if (dataNascitaFormattata.includes('-')) {
      const [anno, mese, giorno] = dataNascitaFormattata.split('-');
      dataNascitaFormattata = `${giorno}/${mese}/${anno}`;
    }
    const luogoDataNascita = `${dati.luogoNascita || ''} (${dati.provinciaNascita || ''}), ${dataNascitaFormattata}`;
    firstPage.drawText(luogoDataNascita, { x: 240, y: 424, size: textSize, font });
    
    // Riga 3: Codice Fiscale
    firstPage.drawText(dati.codiceFiscale || '', { x: 191, y: 407, size: textSize, font });
    
    // Riga 4: Cittadinanza
    const cittadinanza = dati.cittadinanza || "Italiana";
    firstPage.drawText(cittadinanza, { x: 182, y: 391, size: textSize, font });

    // --- SEZIONE 2: RESIDENZA E CONTATTI ---
    // Riga 5: Via/Piazza
    firstPage.drawText(dati.indirizzoResidenza || '', { x: 247, y: 374, size: textSize, font });
    
    // Riga 6: Città e Prov di Residenza
    const cittaCompleta = `${dati.cittaResidenza || ''} (${dati.provinciaResidenza || ''})`;
    firstPage.drawText(cittaCompleta, { x: 140, y: 358, size: textSize, font });

    // Riga 7: Email e Telefono
    firstPage.drawText(dati.email || '', { x: 145, y: 342, size: textSize, font });
    firstPage.drawText(dati.telefono || '', { x: 447, y: 342, size: textSize, font });

    // --- SEZIONE 4: PRIVACY, DATA E FIRME ---
    
    // Consenso Foto/Video (Facoltativo)
    const haAcconsentito = 
      dati.consensoPrivacy === true || 
      dati.consensoPrivacy === "true" || 
      dati.consensoPrivacy === "on";

    const testoConsenso = haAcconsentito  === true 
      ? "ACCONSENTE all'uso delle immagini" 
      : "NON ACCONSENTE all'uso delle immagini";
    firstPage.drawText(testoConsenso, { x: 71, y: 121, size: 10, font: fontBold }); 

    // Luogo e data in fondo (sulla riga apposita)
    const dataOdierna = new Date().toLocaleDateString('it-IT');
    const luogoCompilazione = dati.cittaResidenza || "Monesiglio"; // Usa la città come luogo di firma
    const luogoData = `${luogoCompilazione}, ${dataOdierna}`;
    firstPage.drawText(luogoData, { x: 148, y: 101, size: textSize, font });

    // Firma Elettronica (OTP) - Al posto dello scarabocchio a penna
    const codiceOTP = dati.otp || "Non fornito";
    const ipFirma = dati.ip || "IP non tracciato";
    const dataOraFirma = new Date().toLocaleString('it-IT');
    
    // Creiamo un blocco testo a più righe per la validità legale
    const testoFirmaOTP = `Firma elettronica validata tramite OTP: ${codiceOTP}\nApposta il: ${dataOraFirma}\nIndirizzo IP: ${ipFirma}`;
    
    // Lo posizioniamo sulla riga "Firma del Socio (o Genitore):"
    firstPage.drawText(testoFirmaOTP, { 
      x: 230, 
      y: 85, 
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
        // 'attachment' fa scaricare il file, 'inline' lo mostra nel browser se possibile
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