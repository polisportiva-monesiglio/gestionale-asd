-- Chiusura dei rilievi 01, 02, 03, 04, 07 e 16 della revisione del 2 settembre 2026.
--
-- ATTENZIONE ALL'ORDINE. Questa migrazione RESTRINGE, e va applicata SOLO DOPO
-- che il codice corrispondente e' in produzione. Prima del deploy romperebbe:
--   * la richiesta di abbonamento, che oggi scrive con la chiave pubblica e
--     dal deploy in poi passa dal client di servizio;
--   * il caricamento del certificato, che oggi scrive con la chiave pubblica e
--     dal deploy in poi usa un collegamento firmato dal server
--     (`/api/certificato-upload`, che a sua volta ha bisogno della migrazione
--     additiva 20260902090000, gia' applicata).
--
-- Le prove di ognuna di queste modifiche sono state eseguite impersonando i
-- ruoli in transazione con rollback: attacchi bloccati, gestore attivo intatto,
-- caricamento legittimo del certificato ancora funzionante.


-- ============================================================
-- 01 · Disattivare un gestore non gli toglieva quasi niente
-- ============================================================
-- Su queste tre tabelle convivevano due generazioni di policy. Le nuove passano
-- da is_gestore(), che controlla `attivo = true`. Le vecchie erano PUBLIC e si
-- fermavano a `exists (select 1 from gestori where user_id = auth.uid())`.
-- Essendo permissive bastava che passasse una: un gestore disattivato
-- continuava a leggere e scrivere abbonamenti e ricevute, e a riscrivere il
-- codice della cassetta.
--
-- Restano `gestori_all_abbonamenti`, `gestori_all_ricevute` e
-- `gestori_all_impostazioni`, che sono ALL e coprono gli stessi usi passando
-- pero' da is_gestore(). Verificato: un gestore attivo continua a vedere soci,
-- abbonamenti, ricevute e codice cassetta, e a confermare i pagamenti.
drop policy if exists "pagamenti all gestori"        on public.pagamenti_ricevute;
drop policy if exists "abbonamenti select gestori"   on public.abbonamenti_soci;
drop policy if exists "abbonamenti update gestori"   on public.abbonamenti_soci;
drop policy if exists "impostazioni update by gestori" on public.impostazioni;


-- ============================================================
-- 02 · Un socio si autoassegnava il certificato medico di un altro
-- ============================================================
-- La lettura sul bucket `certificati-medici` e' concessa se una riga di questa
-- tabella, del socio, contiene quel nome in url_certificato_pdf. Ma la `with
-- check` vincolava solo socio_id: il percorso restava libero, e il socio si
-- scriveva da se' il permesso che poi gli veniva concesso.
--
-- Ora il percorso deve stare sotto la cartella dell'utente, che e' esattamente
-- quello che scrive `uploadCertificato` (`${user.id}/…`). I certificati della
-- prima iscrizione e del rinnovo stanno sotto `iscrizioni/` ma li scrive il
-- client di servizio, che non passa dalle RLS.
drop policy if exists "socio insert proprio storico certificati" on public.certificati_medici_storico;
create policy "socio insert proprio storico certificati"
  on public.certificati_medici_storico
  for insert to authenticated
  with check (
    socio_id in (select id from public.soci where user_id = auth.uid())
    and url_certificato_pdf like (auth.uid())::text || '/%'
  );


-- ============================================================
-- 03 · Un socio si dichiarava «pagato» da solo
-- ============================================================
-- La `with check` vincolava solo socio_id: stato_pagamento, quota UISP e date
-- di validita' li sceglieva chi scriveva. Con `stato_pagamento: 'pagato'` si
-- apriva il codice della cassetta, si azzerava per sempre la quota UISP e la
-- riga non compariva in area gestori, che elenca solo le richieste da saldare.
--
-- Dal deploy la riga la scrive `richiestaAbbonamento` con il client di
-- servizio, dopo aver riletto l'attivita' a listino, calcolato il periodo,
-- verificato la decorrenza e accertato che il socio sia di chi chiede. Al
-- browser non serve piu' poter inserire, quindi non puo' piu'.
drop policy if exists "abbonamenti insert own socio" on public.abbonamenti_soci;
revoke insert on public.abbonamenti_soci from authenticated;


-- ============================================================
-- 04 · Chiunque avesse un accesso bruciava la numerazione delle ricevute
-- ============================================================
-- La funzione e' SECURITY DEFINER ed e' esposta su /rest/v1/rpc/ al ruolo
-- authenticated: un socio qualunque la chiamava e consumava numeri, con un
-- salto definitivo nella sequenza (il riuso vale solo per un numero riservato
-- sullo stesso abbonamento).
--
-- Non si revoca l'EXECUTE: `confermaPagamento` la chiama con il client del
-- gestore, non con quello di servizio. Si mette il controllo dentro, dove vale
-- comunque anche se domani la rotta cambiasse.
create or replace function public.genera_numero_ricevuta(p_anno integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_numero integer;
begin
  if not public.is_gestore() then
    raise exception 'Solo un gestore attivo puo'' emettere una ricevuta'
      using errcode = '42501';
  end if;

  insert into public.contatori_ricevute (anno, ultimo)
  values (p_anno, 1)
  on conflict (anno) do update set ultimo = public.contatori_ricevute.ultimo + 1
  returning ultimo into v_numero;

  return 'RIC-' || p_anno || '-' || lpad(v_numero::text, 4, '0');
end;
$function$;


-- ============================================================
-- 05 · Chiunque, senza account, caricava file nel bucket dei certificati
-- ============================================================
-- Dal deploy il permesso di caricare lo firma il server
-- (`/api/certificato-upload`), che sceglie il percorso e conta i caricamenti
-- per provenienza. Il collegamento firmato vale per un percorso solo e per
-- pochi minuti, e non passa dalle policy di INSERT: queste due non servono
-- piu' a nessuno.
--
-- NON applicare prima del deploy: senza il codice nuovo, nessuno riesce piu'
-- ad allegare il certificato all'iscrizione.
drop policy if exists "certificati upload iscrizione anon"          on storage.objects;
drop policy if exists "certificati upload iscrizione authenticated" on storage.objects;


-- ============================================================
-- 07 · I moduli firmati erano difesi da un permesso mancante, non da una policy
-- ============================================================
-- Questa policy lasciava a un socio riscrivere il proprio tesseramento,
-- comprese url_modulo_firmato_pdf e url_certificato_pdf, che sono le colonne su
-- cui si appoggiano le letture dallo storage. A fermarla era solo l'assenza del
-- GRANT UPDATE: un `grant update` dato per sbaglio avrebbe aperto la lettura
-- dei moduli firmati di chiunque. Nessuna parte dell'applicazione la usa —
-- l'unico UPDATE su questa tabella lo fa il client di servizio.
drop policy if exists "tesseramenti update own socio" on public.tesseramenti_annuali;
revoke update on public.tesseramenti_annuali from authenticated;


-- ============================================================
-- 08 · Gli indirizzi si confrontano esatti: che siano tutti in minuscolo
-- ============================================================
-- Il callback di accesso confronta `soci.email` con quella dell'account, che
-- Supabase normalizza sempre in minuscolo, e le policy `claim by email` fanno
-- lo stesso confronto esatto. Dal deploy iscrizione e rinnovo salvano in
-- minuscolo; questo allinea quello che c'e' gia'. Oggi non ci sono righe
-- interessate: e' una rete, non una riparazione.
update public.soci
   set email = lower(email)
 where email is not null and email <> lower(email);

update public.soci
   set genitore_email = lower(genitore_email)
 where genitore_email is not null and genitore_email <> lower(genitore_email);

update public.gestori
   set email = lower(email)
 where email is not null and email <> lower(email);


-- ============================================================
-- 16 · Una tabella che non serve a nessuno
-- ============================================================
-- RLS attiva, zero policy, zero righe, e nessun riferimento in app/, lib/ o
-- supabase/. Restando li' comparirebbe in ogni futuro giro di controlli come
-- tabella senza policy, cioe' come rumore che copre i rilievi veri.
drop table if exists public.registro_presenze;
