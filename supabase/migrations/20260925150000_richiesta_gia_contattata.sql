-- Chi ha già scritto al socio, e quando (25 settembre 2026).
--
-- I gestori sono più d'uno e guardano le stesse richieste: senza un segno,
-- due persone scrivono allo stesso socio per la stessa cosa, a poche ore di
-- distanza. Il gestionale lo registra quando qualcuno apre WhatsApp dalla
-- scheda della richiesta.
--
-- ⚠️ Il nome è scritto anche per esteso, come per `rifiutato_da_nome`: un
-- gestore non amministratore legge solo la propria riga in `gestori` (policy
-- `gestori select own`), quindi risolvendo il nome per collegamento vedrebbe
-- vuoti tutti i contatti presi dagli altri — che è esattamente l'informazione
-- che serve. Il nome per esteso sopravvive anche a un gestore rimosso
-- dall'elenco, come la chiave esterna in `on delete set null`.
--
-- Migrazione che aggiunge: si applica prima del codice che la usa.

alter table public.abbonamenti_soci
  add column if not exists contattato_il timestamptz,
  add column if not exists contattato_da uuid references public.gestori(id) on delete set null,
  add column if not exists contattato_da_nome text;

comment on column public.abbonamenti_soci.contattato_il is
  'Quando un gestore ha aperto WhatsApp verso il socio da questa richiesta. Dice che qualcuno ha scritto, non che il socio abbia risposto.';
