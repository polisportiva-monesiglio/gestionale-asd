import { type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ipDellaRichiesta } from '@/lib/ip'
import { verificaOtp, consumaOtp } from '@/lib/otp'
import { componiModuloFirmato } from '@/lib/moduloPdf'
import { getAnnoSportivo } from '@/lib/stagione'
import { normalizzaTelefono } from '@/lib/telefono'

// Versioni dei testi accettati: le decide il server, non il browser. Se le
// dichiarasse il client, un socio potrebbe risultare vincolato a una versione
// del regolamento diversa da quella che gli è stata effettivamente mostrata.
const VERSIONE_REGOLAMENTO = 'v1.0_2026'
const VERSIONE_STATUTO = 'v1.0_2026'
const VERSIONE_PRIVACY = 'v1.0_2026'

function eMinorenne(dataNascita: string, riferimento: Date): boolean {
  const nascita = new Date(dataNascita)
  if (Number.isNaN(nascita.getTime())) return false
  let eta = riferimento.getFullYear() - nascita.getFullYear()
  const scartoMesi = riferimento.getMonth() - nascita.getMonth()
  if (scartoMesi < 0 || (scartoMesi === 0 && riferimento.getDate() < nascita.getDate())) eta--
  return eta < 18
}

function scadenzaCertificato(dataEmissione: string): string | null {
  const d = new Date(dataEmissione)
  if (Number.isNaN(d.getTime())) return null
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  let dati: Record<string, any>
  let token: string
  let codice: string
  let certificatoPath: string | null

  try {
    const body = await req.json()
    dati = body?.dati ?? {}
    token = String(body?.token ?? '')
    codice = String(body?.codice ?? '')
    certificatoPath = body?.certificatoPath ? String(body.certificatoPath) : null
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  if (!token || !codice) {
    return NextResponse.json({ error: 'Codice OTP mancante' }, { status: 400 })
  }

  const obbligatori = ['nome', 'cognome', 'codiceFiscale', 'dataNascita', 'email', 'dataCertificato']
  const mancanti = obbligatori.filter(c => !dati?.[c])
  if (mancanti.length > 0) {
    return NextResponse.json(
      { error: `Dati incompleti: ${mancanti.join(', ')}` },
      { status: 400 }
    )
  }

  const emailFirma = String(dati.email).trim()

  // 0. Il client di servizio si crea per primo: se la configurazione fosse
  //    incompleta, verificare l'OTP prima significherebbe consumarlo — è
  //    monouso — per poi fallire comunque, obbligando il socio a chiederne
  //    un altro senza capire perché.
  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    console.error('Client di servizio non disponibile:', e)
    return NextResponse.json({ error: 'Configurazione del server incompleta' }, { status: 500 })
  }

  // 1. Verifica dell'OTP dentro la stessa richiesta che scriverà l'iscrizione.
  //    Nulla può inserirsi fra il controllo e la scrittura.
  const esito = await verificaOtp({ email: emailFirma, codice, token, dati })
  if (!esito.valido) {
    return NextResponse.json({ error: esito.errore }, { status: esito.stato })
  }

  // 1-bis. Il codice fiscale è unico in tabella. Il controllo sta qui, dopo la
  //    verifica dell'OTP ma prima di consumarlo: prima renderebbe l'endpoint un
  //    modo per scoprire chi è iscritto, dopo brucerebbe il codice del socio per
  //    un errore che deve solo correggere.
  const { data: giaIscritto, error: verificaCfErr } = await supabase
    .from('soci')
    .select('id')
    .eq('cf', String(dati.codiceFiscale).toUpperCase())
    .maybeSingle()

  if (verificaCfErr) {
    console.error('Controllo codice fiscale fallito:', verificaCfErr.message)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
  if (giaIscritto) {
    return NextResponse.json(
      {
        error: 'Risulta già un socio registrato con questo codice fiscale. Se sei tu, accedi alla tua area personale dalla pagina di accesso; se pensi sia un errore, contatta la segreteria.',
        codice: 'cf_duplicato',
      },
      { status: 409 }
    )
  }

  // 1-ter. Il percorso del certificato arriva dal browser e non è coperto
  //    dall'impronta che lega l'OTP ai dati: va quindi verificato qui.
  //    Due controlli, perché servono a due cose diverse.
  if (certificatoPath !== null) {
    // Forma: il caricamento pubblico può scrivere solo sotto `iscrizioni/`, e
    // il nome è un identificativo casuale. Fuori da lì il riferimento punta a
    // qualcosa che questo percorso non ha il diritto di indicare.
    if (!/^iscrizioni\/[A-Za-z0-9._-]{1,120}$/.test(certificatoPath)) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }

    // Unicità: senza questo, chi chiama l'API a mano può indicare il
    // certificato già allegato a un altro socio e farsi attribuire il suo
    // documento sanitario. Il gestore che poi lo apre valuterebbe l'idoneità
    // sul certificato della persona sbagliata.
    const [{ data: suTesseramenti }, { data: suStorico }] = await Promise.all([
      supabase.from('tesseramenti_annuali').select('id').eq('url_certificato_pdf', certificatoPath).limit(1),
      supabase.from('certificati_medici_storico').select('id').eq('url_certificato_pdf', certificatoPath).limit(1),
    ])

    if ((suTesseramenti?.length ?? 0) > 0 || (suStorico?.length ?? 0) > 0) {
      return NextResponse.json({ error: 'Riferimento del certificato non valido' }, { status: 400 })
    }
  }

  // 1-quater. Solo ora il codice viene speso.
  if (!(await consumaOtp(esito.tokenHash))) {
    return NextResponse.json(
      { error: 'Questo codice è già stato utilizzato per una firma. Richiedine uno nuovo.' },
      { status: 409 }
    )
  }

  // 2. Elementi probatori: li stabilisce il server.
  const firmatoIl = new Date()
  const ip = ipDellaRichiesta(req)
  const annoSportivo = getAnnoSportivo(firmatoIl)
  const minorenne = eMinorenne(String(dati.dataNascita), firmatoIl)

  const scadenza = scadenzaCertificato(String(dati.dataCertificato))
  if (!scadenza) {
    return NextResponse.json({ error: 'Data del certificato non valida' }, { status: 400 })
  }

  const socioId = crypto.randomUUID()
  const tesseramentoId = crypto.randomUUID()

  // 3. Il PDF si compone prima di scrivere: se fallisce, non resta nulla a metà.
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await componiModuloFirmato(dati, {
      otpHash: esito.otpHash,
      ip,
      firmatoIl,
      annoSportivo,
    })
  } catch (e) {
    console.error('Composizione del modulo fallita:', e)
    return NextResponse.json({ error: 'Generazione del documento fallita' }, { status: 500 })
  }

  const hashModulo = crypto.createHash('sha256').update(pdfBytes).digest('hex')

  // 4. Scrittura delle due righe.
  const { error: socioErr } = await supabase.from('soci').insert({
    id: socioId,
    nome: dati.nome,
    cognome: dati.cognome,
    sesso: dati.sesso,
    cf: dati.codiceFiscale,
    data_nascita: dati.dataNascita,
    luogo_nascita: dati.luogoNascita,
    provincia_nascita: dati.provinciaNascita,
    cittadinanza: dati.cittadinanza,
    indirizzo: dati.indirizzoResidenza,
    cap: dati.capResidenza,
    citta: dati.cittaResidenza,
    provincia_residenza: dati.provinciaResidenza,
    telefono: normalizzaTelefono(dati.telefono),
    email: emailFirma,
    minorenne,
    genitore_nome: minorenne ? dati.genitoreNome : null,
    genitore_cognome: minorenne ? dati.genitoreCognome : null,
    genitore_contatto_preferito: minorenne ? dati.genitoreContattoScelta : null,
    genitore_recapito: minorenne ? dati.genitoreContatto : null,
  })

  if (socioErr) {
    console.error('Inserimento socio fallito:', socioErr.message)
    // Rete di sicurezza: il controllo sopra non copre due iscrizioni identiche
    // inviate nello stesso istante, che si incontrerebbero solo qui.
    if (socioErr.code === '23505') {
      return NextResponse.json(
        {
          error: 'Risulta già un socio registrato con questo codice fiscale. Se sei tu, accedi alla tua area personale dalla pagina di accesso; se pensi sia un errore, contatta la segreteria.',
          codice: 'cf_duplicato',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Salvataggio dei dati fallito' }, { status: 500 })
  }

  const { error: tessErr } = await supabase.from('tesseramenti_annuali').insert({
    id: tesseramentoId,
    socio_id: socioId,
    anno_sportivo: annoSportivo,
    data_scadenza_certificato: scadenza,
    url_certificato_pdf: certificatoPath,
    stato_firma: 'firmato',
    otp_generato: esito.otpHash,
    ip_firma: ip,
    timestamp_firma: firmatoIl.toISOString(),
    // Un solo nome per ogni consenso, e il nome dice di quale si tratta.
    // Prima esisteva anche `consenso_privacy`, che però conteneva il consenso
    // facoltativo alle immagini: chi lo avesse letto per sapere se il socio
    // aveva accettato l'informativa avrebbe ottenuto l'esatto contrario del
    // vero per ogni socio che ha rifiutato le foto.
    consensi: {
      consensi_salute: dati.consensoSalute,
      regolamento: dati.consensoRegolamento,
      versione_regolamento: VERSIONE_REGOLAMENTO,
      versione_statuto: VERSIONE_STATUTO,
      consensi_videosorveglianza: dati.consensoVideosorveglianza,
      consenso_informativa_privacy: dati.consensoInformativaPrivacy,
      versione_privacy: VERSIONE_PRIVACY,
      consenso_immagini_facoltativo: dati.consensoImmagini,
    },
  })

  if (tessErr) {
    console.error('Inserimento tesseramento fallito:', tessErr.message)
    // Il socio appena creato resterebbe orfano: lo rimuovo.
    await supabase.from('soci').delete().eq('id', socioId)
    return NextResponse.json({ error: 'Salvataggio del tesseramento fallito' }, { status: 500 })
  }

  // 5. Archiviazione del modulo firmato e impronta del documento.
  const storagePath = `${annoSportivo}/${tesseramentoId}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('moduli-firmati')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf' })

  if (uploadErr) {
    // L'iscrizione è valida comunque: si segnala senza farla fallire.
    console.error('Archiviazione del modulo fallita:', uploadErr.message)
  } else {
    const { error: aggiornaErr } = await supabase
      .from('tesseramenti_annuali')
      .update({ url_modulo_firmato_pdf: storagePath, hash_modulo_pdf: hashModulo })
      .eq('id', tesseramentoId)
    if (aggiornaErr) console.error('Collegamento del modulo fallito:', aggiornaErr.message)
  }

  // 6. Collegamento temporaneo per far scaricare il documento all'interessato.
  let urlDownload: string | null = null
  if (!uploadErr) {
    const nomeFile = `Iscrizione_${dati.cognome ?? 'Socio'}_${dati.nome ?? ''}.pdf`.replace(/\s+/g, '')
    const { data } = await supabase.storage
      .from('moduli-firmati')
      // `download` imposta il Content-Disposition: il collegamento firmato sta
      // su un altro dominio, dove l'attributo download del link viene ignorato.
      .createSignedUrl(storagePath, 3600, { download: nomeFile })
    urlDownload = data?.signedUrl ?? null
  }

  return NextResponse.json({
    ok: true,
    tesseramentoId,
    annoSportivo,
    urlDownload,
    hashModulo,
  })
}
