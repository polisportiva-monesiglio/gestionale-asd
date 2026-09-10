-- Correggere l'anagrafica di un socio, lasciando traccia.
--
-- Nasce da due casi veri del settembre 2026: un socio che ha scritto il proprio
-- nome in tutti e due i campi, e uno che ha digitato 2026 invece di 2006
-- sull'anno di nascita — e quel refuso lo ha fatto risultare minorenne, quindi
-- ha firmato il modulo come genitore di sé stesso.
--
-- I dati del socio vivono in due posti che vogliono dire cose diverse: la riga
-- in tabella è il **registro di lavoro** (foglio UISP, ricevute, elenchi), il
-- modulo firmato è il **documento**. Il primo si corregge, il secondo no.

-- 1. Chi ha corretto cosa, e quando.
--
-- Senza questo registro la tabella e il modulo firmato divergono e nessuno sa
-- più perché: fra sei mesi ci si ritrova un modulo che dice "Elvira Elvira" e
-- una riga che dice "Barbaro Elvira", senza niente che colleghi le due cose.
create table if not exists public.correzioni_anagrafica (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references public.soci(id) on delete cascade,

  campo text not null,
  valore_precedente text,
  valore_nuovo text,

  -- Riferimento **e** nome per esteso, come in `abbonamenti_soci.rifiutato_da`:
  -- un gestore non amministratore può leggere solo la propria riga in
  -- `gestori`, quindi risolvendo il nome per collegamento vedrebbe vuote le
  -- correzioni fatte dai colleghi.
  gestore_id uuid references public.gestori(id) on delete set null,
  gestore_nome text not null,

  motivo text,
  corretto_il timestamptz not null default now()
);

comment on table public.correzioni_anagrafica is
  'Ogni correzione fatta da un gestore ai dati di un socio. Spiega perché la riga in tabella e il modulo firmato non dicono la stessa cosa.';

create index if not exists correzioni_anagrafica_socio_idx
  on public.correzioni_anagrafica (socio_id, corretto_il desc);

alter table public.correzioni_anagrafica enable row level security;

-- I gestori leggono e scrivono; il socio non ha niente da vedere qui.
create policy "gestori_all_correzioni" on public.correzioni_anagrafica
  for all to authenticated using (is_gestore()) with check (is_gestore());

-- 2. I moduli firmati che sono stati sostituiti da uno nuovo.
--
-- ⚠️ È una tabella a parte e **non** una colonna "sostituito" su
-- `tesseramenti_annuali`, ed è una scelta deliberata: ventiquattro punti del
-- codice leggono quella tabella dando per scontato che quello che c'è dentro
-- valga. Una bandierina andrebbe rispettata da quasi tutti, e il giorno che se
-- ne dimentica uno un modulo superato finisce sul foglio UISP. Spostando la
-- riga, quei ventiquattro punti restano corretti senza modificarli.
--
-- Il PDF in archiviazione **non si tocca**: resta dov'è, e questa riga lo
-- indica. Un modulo firmato è una dichiarazione che è stata fatta davvero;
-- cancellarla toglierebbe la prova del perché ce n'è una seconda.
create table if not exists public.tesseramenti_sostituiti (
  id uuid primary key,
  socio_id uuid not null references public.soci(id) on delete cascade,
  anno_sportivo text not null,

  data_scadenza_certificato date,
  url_certificato_pdf text,
  url_modulo_firmato_pdf text,
  hash_modulo_pdf text,
  stato_firma text,
  timestamp_firma timestamptz,
  ip_firma text,
  otp_generato text,
  consensi jsonb,
  invio_uisp_id uuid,

  sostituito_il timestamptz not null default now(),
  sostituito_da uuid references public.gestori(id) on delete set null,
  sostituito_da_nome text not null,
  motivo text not null
);

comment on table public.tesseramenti_sostituiti is
  'Moduli firmati superati da una nuova firma. Il PDF resta in archiviazione: qui si conserva la riga e il motivo della sostituzione.';

create index if not exists tesseramenti_sostituiti_socio_idx
  on public.tesseramenti_sostituiti (socio_id, sostituito_il desc);

alter table public.tesseramenti_sostituiti enable row level security;

create policy "gestori_all_sostituiti" on public.tesseramenti_sostituiti
  for all to authenticated using (is_gestore()) with check (is_gestore());
