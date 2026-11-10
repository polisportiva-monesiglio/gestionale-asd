-- Chi ha avvisato il socio che la frequenza sta per finire (10 novembre 2026).
--
-- L'email automatica cinque giorni prima non basta: molti non la leggono, e
-- il gestore li avvisa a voce o su WhatsApp. Senza un segno due gestori
-- scrivono alla stessa persona, oppure nessuno, ognuno convinto che l'abbia
-- fatto l'altro.
--
-- Colonne a parte e non `contattato_il`: quella dice chi ha scritto al socio
-- mentre la **richiesta** era da decidere, e su un periodo poi pagato resta
-- piena. Riusarla farebbe leggere «già avvisato del rinnovo» a chi era stato
-- sentito mesi prima per tutt'altro.
--
-- Il nome per esteso per la stessa ragione di `contattato_da_nome`: un gestore
-- non amministratore non legge le righe degli altri in `gestori`.
--
-- Migrazione che aggiunge: si applica prima del codice che la usa.

alter table public.abbonamenti_soci
  add column if not exists avvisato_rinnovo_il timestamptz,
  add column if not exists avvisato_rinnovo_da uuid references public.gestori(id) on delete set null,
  add column if not exists avvisato_rinnovo_da_nome text;

comment on column public.abbonamenti_soci.avvisato_rinnovo_il is
  'Quando un gestore ha aperto WhatsApp per ricordare al socio che questo periodo finisce. Dice che qualcuno ha scritto, non che il socio abbia rinnovato.';

-- I gestori leggono quali email di promemoria sono partite, così in Dashboard
-- vedono «email inviata il …» accanto a chi scade e sanno se serve altro.
-- Solo lettura: ci scrive sempre e soltanto la Edge Function.
grant select on public.invii_promemoria_frequenza to authenticated;

drop policy if exists "promemoria frequenza select gestori" on public.invii_promemoria_frequenza;
create policy "promemoria frequenza select gestori"
  on public.invii_promemoria_frequenza
  for select
  to authenticated
  using (public.is_gestore());
