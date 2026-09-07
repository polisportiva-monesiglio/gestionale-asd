-- Chi ha deciso una richiesta di frequenza, e quando.
--
-- Prima di questa migrazione le due decisioni erano registrate in modo
-- opposto, e nessuna delle due per intero:
--
--   accettate  -> `pagamenti_ricevute.operatore` dice CHI, ma `data_incasso`
--                 e' una `date`: si sa il giorno, non l'ora.
--   rifiutate  -> `abbonamenti_soci.rifiutato_il` dice QUANDO al secondo, ma
--                 CHI non era scritto da nessuna parte.
--
-- Cosi' non si poteva rispondere alla domanda piu' semplice che un consiglio
-- si fa: chi ha deciso questa cosa, e quando.

-- 1. Il rifiuto: chi lo ha fatto.
--
-- Si tiene sia il riferimento sia il nome scritto per esteso, come gia' fa
-- `pagamenti_ricevute.operatore`. Il riferimento serve a raggruppare e a
-- filtrare; il nome serve perche' la storia sopravviva a un gestore che lascia
-- l'associazione e viene cancellato dall'elenco. Un rifiuto senza piu' un nome
-- non e' una riga incompleta: e' una decisione di cui non risponde piu'
-- nessuno.
alter table public.abbonamenti_soci
  add column if not exists rifiutato_da uuid references public.gestori(id) on delete set null,
  add column if not exists rifiutato_da_nome text;

comment on column public.abbonamenti_soci.rifiutato_da is
  'Il gestore che ha rifiutato la richiesta. Diventa nullo se il gestore viene cancellato: il nome resta in rifiutato_da_nome.';

-- 2. La conferma: l'ora esatta, e il riferimento al gestore.
--
-- `confermato_il` resta nullo sulle quattordici ricevute gia' emesse: l'ora
-- non e' stata registrata e non si inventa. Chi legge lo storico mostra il
-- giorno di `data_incasso` quando l'ora non c'e'.
alter table public.pagamenti_ricevute
  add column if not exists gestore_id uuid references public.gestori(id) on delete set null,
  add column if not exists confermato_il timestamptz;

comment on column public.pagamenti_ricevute.confermato_il is
  'Momento esatto della conferma. Nullo sulle ricevute emesse prima del 7 settembre 2026: allora si registrava solo la data in data_incasso.';

-- 3. Quello che si puo' ricostruire, si ricostruisce.
--
-- I nomi in `operatore` sono stati scritti da `gestori.nome` e combaciano
-- ancora esattamente: il collegamento e' un fatto, non un indovinello.
update public.pagamenti_ricevute r
   set gestore_id = g.id
  from public.gestori g
 where r.gestore_id is null
   and r.operatore = g.nome;

-- L'unico rifiuto registrato finora: 7 settembre 2026, richiesta trimestrale
-- di un socio a cui era stato chiesto il mensile. Il nome non era stato
-- scritto perche' il codice non lo scriveva; lo ha indicato Luca Spinardi il
-- giorno stesso. La riga si individua per l'istante esatto del rifiuto, non
-- per "tutti i rifiuti senza nome": su un database gia' cresciuto quella
-- scorciatoia attribuirebbe a lui anche decisioni di altri.
update public.abbonamenti_soci a
   set rifiutato_da = g.id,
       rifiutato_da_nome = g.nome
  from public.gestori g
 where g.nome = 'Luca Spinardi'
   and a.rifiutato_il = timestamptz '2026-09-07 06:06:03.746+00'
   and a.rifiutato_da is null;

-- 4. Ritrovare le decisioni di un socio, e l'elenco in ordine di tempo, sono
--    le due letture che fara' l'area gestori.
create index if not exists abbonamenti_soci_rifiutato_il_idx
  on public.abbonamenti_soci (rifiutato_il desc) where rifiutato_il is not null;
