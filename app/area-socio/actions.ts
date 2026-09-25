'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnnoSportivo } from '@/lib/stagione'
import { revalidatePath } from 'next/cache'
import { notificaNuovaRichiesta, notificaRichiestaCorsoAiTecnici } from '@/lib/notifiche'
import { periodoAbbonamento, inizioValido, decorrenzeAmmesse } from '@/lib/abbonamento'
import { metodoAccettabile } from '@/lib/pagamenti'
import { riconosciCertificato } from '@/lib/certificatoFile'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Il socio per cui si sta agendo.
 *
 * A un account possono corrispondere piu' soci - un genitore che ha iscritto
 * due figli con la propria email - quindi non basta piu' "il socio di questo
 * utente": va detto quale, e va verificato che sia davvero suo.
 *
 * La verifica non e' formale: `socio_id` arriva da un campo del modulo, e
 * senza il controllo su user_id chiunque potrebbe caricare un certificato o
 * chiedere un abbonamento a nome di un altro socio. Le RLS lo fermerebbero
 * comunque, ma un permesso negato a meta' operazione lascia le cose a meta'.
 */
async function socioDellUtente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  socioIdRichiesto: string | null
): Promise<{ id: string; nome: string | null; cognome: string | null } | { errore: string }> {
  // Nome e cognome non servono ai controlli: servono alla segnalazione che
  // parte dopo, per non dover interrogare di nuovo la stessa riga.
  const { data: soci, error } = await supabase
    .from('soci')
    .select('id, nome, cognome')
    .eq('user_id', userId)

  if (error) return { errore: 'Non è stato possibile leggere il tuo profilo. Riprova.' }
  if (!soci || soci.length === 0) return { errore: 'Profilo socio non trovato.' }

  if (socioIdRichiesto) {
    const trovato = soci.find(s => s.id === socioIdRichiesto)
    return trovato
      ? { id: trovato.id, nome: trovato.nome, cognome: trovato.cognome }
      : { errore: 'Profilo socio non trovato.' }
  }

  // Nessun id indicato: va bene solo se di socio ce n'e' uno solo. Con piu'
  // soci, scegliere per conto dell'utente significherebbe agire sulla persona
  // sbagliata senza dirglielo.
  if (soci.length > 1) {
    return { errore: 'Scegli prima la persona a cui si riferisce la richiesta.' }
  }

  return { id: soci[0].id, nome: soci[0].nome, cognome: soci[0].cognome }
}

/**
 * Registra un certificato gia' caricato nell'archivio.
 *
 * ⚠️ Il file **non passa piu' da qui**. Passava, e il 25 settembre 2026 il
 * caricamento di un PDF ha smesso di funzionare con un «This page couldn't
 * load» senza messaggio: il corpo di una richiesta al server ha un tetto
 * (circa 4,5 MB su Vercel), e un certificato scansionato lo supera. La
 * richiesta moriva prima di arrivare al codice, quindi nessun controllo
 * poteva accorgersene ne' spiegarlo. Con le foto, piu' pesanti dei PDF,
 * sarebbe diventata la regola.
 *
 * Ora il browser carica diritto nell'archivio con un permesso firmato, come
 * gia' faceva il rinnovo completo (`lib/caricaCertificato.ts`), e qui arriva
 * soltanto il percorso del file.
 */
export async function registraCertificato(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const percorso = (formData.get('percorso') as string | null)?.trim()
  const dataCertificato = formData.get('data_certificato') as string | null

  if (!percorso) return { ok: false, error: 'Caricamento non riuscito: riprova.' }
  if (!dataCertificato) return { ok: false, error: 'Inserisci la data del certificato.' }

  // Il percorso arriva dal browser, quindi non ci si fida: deve stare nella
  // cartella di chi sta chiedendo. E' la stessa che il permesso firmato ha
  // imposto, ed e' cio' che impedisce di intestarsi il certificato di un altro.
  if (!percorso.startsWith(`${user.id}/`) || percorso.includes('..')) {
    return { ok: false, error: 'Caricamento non riconosciuto: riprova.' }
  }

  // La data si valida PRIMA di toccare le tabelle. Con una data illeggibile,
  // `new Date(...).toISOString()` solleva un'eccezione: il file resterebbe
  // nell'archivio senza che nessuna riga lo richiami, e la cancellazione
  // automatica dei certificati scaduti lavora proprio sui riferimenti in
  // tabella. Sarebbe un documento sanitario conservato per sempre, contro
  // quanto dichiara l'informativa.
  const emissione = new Date(dataCertificato)
  if (Number.isNaN(emissione.getTime())) {
    return { ok: false, error: 'La data del certificato non è valida.' }
  }
  emissione.setFullYear(emissione.getFullYear() + 1)
  const scadenzaCertificato = emissione.toISOString().split('T')[0]

  const esito = await socioDellUtente(supabase, user.id, formData.get('socio_id') as string | null)
  if ('errore' in esito) return { ok: false, error: esito.errore }
  const socio = esito

  const annoSportivo = getAnnoSportivo()

  const { data: tesseramento } = await supabase
    .from('tesseramenti_annuali')
    .select('id')
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .maybeSingle()

  if (!tesseramento) {
    return { ok: false, error: `Non risulta un tesseramento per la stagione ${annoSportivo}. Contatta la segreteria.` }
  }

  const admin = createAdminClient()

  // Che cosa sia davvero il file lo dicono i primi byte, non il tipo
  // dichiarato dal browser. Si leggono con una richiesta parziale: bastano
  // dodici byte, non serve riportarsi indietro dieci megabyte.
  const { data: firmato, error: erroreFirma } = await admin.storage
    .from('certificati-medici')
    .createSignedUrl(percorso, 60)

  if (erroreFirma || !firmato) {
    return { ok: false, error: 'Il file caricato non si trova. Riprova.' }
  }

  const rispostaByte = await fetch(firmato.signedUrl, { headers: { Range: 'bytes=0-11' } })
  if (!rispostaByte.ok) {
    return { ok: false, error: 'Il file caricato non si legge. Riprova.' }
  }

  const tipo = riconosciCertificato(new Uint8Array((await rispostaByte.arrayBuffer()).slice(0, 12)))
  if (!tipo) {
    await admin.storage.from('certificati-medici').remove([percorso])
    return { ok: false, error: 'Il file deve essere un PDF o una foto (JPG, PNG, WEBP, HEIC).' }
  }

  // L'aggiornamento lo fa il client di servizio, non quello del socio: al ruolo
  // `authenticated` il permesso di UPDATE su questa tabella non e' mai stato
  // dato, ed e' giusto che non lo sia — e' quello che impedisce a un socio di
  // riscrivere `url_modulo_firmato_pdf` e farsi dare il modulo di un altro.
  const { data: tesseramentoAggiornato, error: updateError } = await admin
    .from('tesseramenti_annuali')
    .update({
      url_certificato_pdf: percorso,
      data_scadenza_certificato: scadenzaCertificato,
    })
    .eq('id', tesseramento.id)
    .select('id')
    .single()

  if (updateError) {
    // Nessuno punta piu' a questo file: va tolto subito, o resta un documento
    // sanitario che nessuna procedura sapra' mai di dover cancellare.
    await admin.storage.from('certificati-medici').remove([percorso])
    return { ok: false, error: `Aggiornamento fallito: ${updateError.message}` }
  }

  // Storico: ogni caricamento resta tracciato anche dopo un rinnovo,
  // così il socio può rivedere i certificati caricati in passato.
  const { error: storicoError } = await admin
    .from('certificati_medici_storico')
    .insert({
      socio_id: socio.id,
      tesseramento_id: tesseramentoAggiornato.id,
      anno_sportivo: annoSportivo,
      url_certificato_pdf: percorso,
      data_scadenza_certificato: scadenzaCertificato,
    })

  if (storicoError) console.error('Salvataggio storico certificato fallito:', storicoError.message)

  revalidatePath('/area-socio')
  return { ok: true }
}

export async function richiestaAbbonamento(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const attivitaId = formData.get('attivita_id') as string | null
  const note = (formData.get('note') as string | null) || null
  const metodoPagamento = (formData.get('metodo_pagamento') as string | null) || null
  if (!attivitaId) return { ok: false, error: "Seleziona un'attività." }

  // Il metodo arrivava dal modulo e finiva in tabella senza che nessuno lo
  // guardasse: togliere un bottone nascondeva la scelta a chi usa il sito, non
  // a chi manda la richiesta a mano. Il `CHECK` in tabella non basta a
  // sostituire questo controllo, perche' continua ad ammettere 'carta' per le
  // tre righe che ce l'hanno gia' scritta.
  if (metodoPagamento !== null && !metodoAccettabile(metodoPagamento)) {
    return { ok: false, error: 'Scegli un metodo di pagamento fra quelli proposti.' }
  }

  // La chiave esterna garantisce che l'attività esista, non che sia ancora in
  // vendita. Senza questo controllo, chi rimanda l'identificativo di
  // un'attività ritirata ottiene il listino vecchio: la ricevuta verrebbe poi
  // emessa su quel prezzo, perché la conferma legge prezzo_base dalla riga
  // collegata senza ricontrollare nulla.
  const { data: attivita } = await supabase
    .from('catalogo_attivita')
    .select('id, nome_attivita, prezzo_base, durata_mesi, tipo')
    .eq('id', attivitaId)
    .eq('attivo', true)
    .maybeSingle()

  if (!attivita) {
    return { ok: false, error: "Questa attività non è più disponibile. Ricarica la pagina e scegli fra quelle a listino." }
  }

  // Da quando parte l'abbonamento lo decide il socio, non piu' una soglia nel
  // mese. Le date le calcola il server: se le mandasse il browser, basterebbe
  // cambiarle per farsi dare mesi che non si sono pagati.
  const annoSportivo = getAnnoSportivo()
  const durata = Number(attivita.durata_mesi ?? 0)
  const inizioRichiesto = formData.get('inizio')
  let periodo: { dataInizio: string; dataFine: string } | null = null
  let inizioScelto: string | null = null

  if (durata >= 1) {
    if (!inizioValido(inizioRichiesto)) {
      return { ok: false, error: 'Scegli da quando vuoi far partire il periodo di frequenza.' }
    }

    // Il modulo disattiva le decorrenze che sforerebbero nella stagione dopo,
    // ma un campo disabilitato nel browser non e' un controllo: chi chiama
    // l'azione a mano lo ignora. Qui si rifa' la stessa verifica, ed e'
    // questa che conta.
    if (!decorrenzeAmmesse(durata, annoSportivo)[inizioRichiesto]) {
      return {
        ok: false,
        error: `Questo periodo di frequenza finirebbe oltre la stagione ${annoSportivo}. Scegli una decorrenza diversa o una durata più breve.`,
      }
    }

    inizioScelto = inizioRichiesto
    periodo = periodoAbbonamento(inizioRichiesto, durata)
  }

  const esito = await socioDellUtente(supabase, user.id, formData.get('socio_id') as string | null)
  if ('errore' in esito) return { ok: false, error: esito.errore }
  const socio = esito

  // Blocco "soft" lato applicazione (UX immediata); il blocco reale e
  // atomico è il vincolo UNIQUE parziale su (socio_id, anno_sportivo)
  // WHERE stato_pagamento = 'da_saldare' — evita richieste duplicate e
  // doppio addebito UISP anche in caso di richieste quasi simultanee.
  const { data: pending } = await supabase
    .from('abbonamenti_soci')
    .select('id')
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .eq('stato_pagamento', 'da_saldare')
    .maybeSingle()

  if (pending) {
    return { ok: false, error: 'Hai già una richiesta in attesa di conferma per questa stagione.' }
  }

  // UISP: €20 se primo pagamento della stagione
  const { data: giaPagato } = await supabase
    .from('abbonamenti_soci')
    .select('id')
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .eq('stato_pagamento', 'pagato')
    .limit(1)

  const uispFee = giaPagato && giaPagato.length > 0 ? 0 : 20

  // La riga la scrive il client di servizio, non quello del socio.
  //
  // Con la chiave pubblica l'unico controllo su questo inserimento erano le
  // RLS, e la loro `with check` vincola soltanto `socio_id`: chiamando l'API a
  // mano si poteva scrivere `stato_pagamento: 'pagato'` — che apre il codice
  // della cassetta, azzera per sempre la quota UISP e non compare in area
  // gestori, che elenca solo le richieste da saldare — oppure una quota a zero
  // e date di validita' a piacere.
  //
  // Tutto quello che finisce nella riga e' deciso qui sopra dal server:
  // l'attivita' e' stata riletta a listino, il periodo calcolato, la
  // decorrenza verificata contro la stagione, e `socioDellUtente` ha gia'
  // accertato che il socio sia di chi sta chiedendo. L'indice unico parziale
  // su (socio_id, anno_sportivo) regge comunque le richieste simultanee.
  const admin = createAdminClient()
  const { error } = await admin
    .from('abbonamenti_soci')
    .insert({
      socio_id: socio.id,
      attivita_id: attivitaId,
      anno_sportivo: annoSportivo,
      stato_pagamento: 'da_saldare',
      importo_tesseramento_uisp: uispFee,
      note_socio: note,
      metodo_pagamento: metodoPagamento,
      inizio_scelto: inizioScelto,
      data_inizio_validita: periodo?.dataInizio ?? null,
      data_fine_validita: periodo?.dataFine ?? null,
    })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Hai già una richiesta in attesa di conferma per questa stagione.' }
    }
    return { ok: false, error: `Richiesta fallita: ${error.message}` }
  }

  // La richiesta e' registrata: da qui la segnalazione alla segreteria non puo'
  // piu' cambiarne l'esito. Parte dopo la risposta, cosi' il socio non aspetta
  // il postino e un guasto di Resend non gli fa credere di aver fallito.
  after(async () => {
    await notificaNuovaRichiesta({
      nomeSocio: `${socio.nome ?? ''} ${socio.cognome ?? ''}`.trim(),
      attivita: attivita.nome_attivita ?? 'Attivita non indicata',
      importoAttivita: Number(attivita.prezzo_base ?? 0),
      importoUisp: uispFee,
      metodo: metodoPagamento,
      note,
      annoSportivo,
      inizioScelto,
      dataInizio: periodo?.dataInizio ?? null,
      dataFine: periodo?.dataFine ?? null,
    })

    // Un corso lo conferma il suo tecnico: deve saperlo come lo sa la
    // segreteria. Si leggono solo le email dei tecnici attivi assegnati.
    if (attivita.tipo === 'corso') {
      const { data: assegnati, error: erroreTecnici } = await admin
        .from('corsi_tecnici')
        .select('tecnici(email, attivo)')
        .eq('attivita_id', attivita.id)

      if (erroreTecnici) {
        console.error('Lettura dei tecnici del corso fallita:', erroreTecnici.message)
        return
      }

      type RigaTecnico = { tecnici: { email: string; attivo: boolean } | { email: string; attivo: boolean }[] | null }
      const emailTecnici = ((assegnati ?? []) as unknown as RigaTecnico[]).flatMap(r => {
        const t = r.tecnici
        return (Array.isArray(t) ? t : t ? [t] : []).filter(x => x.attivo).map(x => x.email)
      })

      await notificaRichiestaCorsoAiTecnici({
        emailTecnici,
        nomeSocio: `${socio.nome ?? ''} ${socio.cognome ?? ''}`.trim(),
        corso: attivita.nome_attivita ?? 'Corso',
        importoAttivita: Number(attivita.prezzo_base ?? 0),
        importoUisp: uispFee,
        metodo: metodoPagamento,
        note,
        annoSportivo,
        dataInizio: periodo?.dataInizio ?? null,
        dataFine: periodo?.dataFine ?? null,
      })
    }
  })

  revalidatePath('/area-socio')
  return { ok: true }
}
