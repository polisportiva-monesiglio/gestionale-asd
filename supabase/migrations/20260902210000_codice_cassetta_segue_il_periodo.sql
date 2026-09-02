-- Rilievo 09 · Il codice della cassetta segue il periodo pagato, non la stagione.
--
-- La stagione scatta il 15 agosto, ma un abbonamento puo' arrivare al 31: fra
-- il 15 e il 31 agosto chi ha pagato fino a fine mese si trovava senza codice,
-- perche' questa policy chiedeva `anno_sportivo = anno_sportivo_corrente()` e
-- il suo abbonamento era ancora quello della stagione appena chiusa.
--
-- Legarla alle date invece che alla stagione toglie il buco e sistema anche il
-- verso opposto, che era altrettanto sbagliato: chi pagava un mese a settembre
-- teneva il codice della palestra fino all'agosto successivo.
--
-- Le attivita' a ingressi non hanno un periodo — `periodoAbbonamento` non
-- restituisce date quando manca la durata in mesi — quindi per quelle si resta
-- legati alla stagione: senza questo ramo perderebbero il codice del tutto.
--
-- La data si legge nel fuso di Monesiglio, come ovunque: a mezzanotte e mezza
-- il server in UTC e' ancora al giorno prima, e un abbonamento scaduto ieri
-- resterebbe buono per due ore.
drop policy if exists "impostazioni select soci abbonati" on public.impostazioni;

create policy "impostazioni select soci abbonati"
  on public.impostazioni
  for select to authenticated
  using (
    exists (
      select 1
        from public.abbonamenti_soci ab
        join public.soci s on s.id = ab.socio_id
       where s.user_id = auth.uid()
         and ab.stato_pagamento = 'pagato'
         and (
           -- a durata: vale finche' il periodo pagato e' in corso
           (
             ab.data_inizio_validita is not null
             and ab.data_fine_validita is not null
             and (now() at time zone 'Europe/Rome')::date
                 between ab.data_inizio_validita and ab.data_fine_validita
           )
           -- a ingressi: nessun periodo da guardare, vale la stagione
           or (
             ab.data_fine_validita is null
             and ab.anno_sportivo = public.anno_sportivo_corrente()
           )
         )
    )
  );
