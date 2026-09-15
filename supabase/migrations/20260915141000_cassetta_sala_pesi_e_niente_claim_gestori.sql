-- Due restrizioni, applicate DOPO il rilascio del codice che le rende sicure.

-- 1. Il codice della cassetta spetta a chi frequenta la sala pesi, non a chi
--    fa solo un corso (decisione dell'associazione, 15 settembre 2026): il
--    corso si fa con l'istruttore. La regola resta quella di prima — periodo
--    pagato e in corso — con in piu' l'esclusione dei periodi di tipo corso.
--    Il join sul catalogo e' LEFT e confronta con coalesce: un periodo senza
--    attivita' collegata continua a valere come prima, invece di sparire.
drop policy if exists "impostazioni select soci abbonati" on public.impostazioni;
create policy "impostazioni select soci abbonati" on public.impostazioni
  for select
  using (
    exists (
      select 1
        from public.abbonamenti_soci ab
        join public.soci s on s.id = ab.socio_id
        left join public.catalogo_attivita c on c.id = ab.attivita_id
       where s.user_id = auth.uid()
         and ab.stato_pagamento = 'pagato'
         and coalesce(c.tipo, '') <> 'corso'
         and (
           (ab.data_inizio_validita is not null
             and ab.data_fine_validita is not null
             and (now() at time zone 'Europe/Rome')::date >= ab.data_inizio_validita
             and (now() at time zone 'Europe/Rome')::date <= ab.data_fine_validita)
           or (ab.data_fine_validita is null and ab.anno_sportivo = public.anno_sportivo_corrente())
         )
    )
  );

-- 2. L'aggancio dei gestori passa ora da `aggancia_gestore()`: le due policy
--    di aggancio per indirizzo non servono piu', e quella di UPDATE lasciava a
--    un gestore invitato impostarsi amministratore da solo.
drop policy if exists "gestori claim by email" on public.gestori;
drop policy if exists "gestori select for claim" on public.gestori;
