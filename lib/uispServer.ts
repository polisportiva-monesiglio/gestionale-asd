import 'server-only'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {
  CAPIENZA,
  PRIMA_RIGA,
  ULTIMA_RIGA,
  formattaDataItaliana,
  separaIndirizzo,
  type RigaUisp,
} from '@/lib/uisp'

/**
 * Compilazione del "Modulo Richiesta Tesseramento" della UISP.
 *
 * Il file non lo disegniamo noi: e' il modulo che la UISP distribuisce, con la
 * sua intestazione, il suo logo e il testo del consenso in fondo. Lo teniamo in
 * `lib/uisp/` e ci scriviamo dentro soltanto le righe dei soci, cosi' se un anno
 * la UISP cambia il modulo basta sostituire il file.
 *
 * L'intestazione (cognome e nome del presidente, denominazione, codice di
 * affiliazione) resta vuota di proposito: negli invii degli anni scorsi era
 * sempre compilata a mano, e inventarsi un codice di affiliazione sarebbe
 * peggio che lasciare il campo bianco.
 */

const MODELLO = path.join(process.cwd(), 'lib', 'uisp', 'modulo-uisp-2026-2027.xlsx')

/** Le colonne che scriviamo. La O ("T") e la P (firma) le riempie il socio a penna. */
const COLONNE = ['A', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N'] as const

function testo(valore: string | null | undefined): string {
  return (valore ?? '').toString().trim()
}

/**
 * Riempie il modello e restituisce il file pronto da spedire.
 *
 * Non tocca nient'altro del foglio: bordi, altezze, celle unite e il logo
 * restano quelli del modello.
 */
export async function compilaModuloUisp(righe: RigaUisp[]): Promise<Buffer> {
  if (righe.length > CAPIENZA) {
    throw new Error(`Il modulo tiene ${CAPIENZA} soci per volta, ne sono stati chiesti ${righe.length}.`)
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MODELLO)
  const ws = wb.worksheets[0]

  // Il modello arriva con un socio d'esempio nella prima riga: va tolto sempre,
  // anche quando le righe da scrivere sono meno di quelle gia' occupate.
  for (let r = PRIMA_RIGA; r <= ULTIMA_RIGA; r++) {
    for (const col of COLONNE) ws.getCell(`${col}${r}`).value = null
  }

  righe.forEach((riga, i) => {
    const r = PRIMA_RIGA + i
    const { via, civico } = separaIndirizzo(riga.indirizzo)

    ws.getCell(`A${r}`).value = [testo(riga.cognome), testo(riga.nome)].filter(Boolean).join(' ')
    ws.getCell(`D${r}`).value = testo(riga.sesso).toUpperCase().slice(0, 1)
    ws.getCell(`E${r}`).value = formattaDataItaliana(riga.dataNascita)
    ws.getCell(`F${r}`).value = testo(riga.luogoNascita)
    ws.getCell(`G${r}`).value = testo(riga.provinciaNascita).toUpperCase()
    ws.getCell(`H${r}`).value = testo(riga.cf).toUpperCase()
    ws.getCell(`I${r}`).value = via
    ws.getCell(`J${r}`).value = civico
    ws.getCell(`K${r}`).value = testo(riga.citta)
    ws.getCell(`L${r}`).value = testo(riga.email)
    ws.getCell(`N${r}`).value = testo(riga.telefono)
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}
