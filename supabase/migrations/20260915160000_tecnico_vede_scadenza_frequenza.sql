-- Il tecnico vede fino a quando è coperto ogni partecipante (15 settembre 2026).
--
-- Fino a oggi `partecipanti_miei_corsi()` diceva solo se la quota è in regola
-- *oggi*: il tecnico scopriva che un mensile era finito il giorno dopo, a
-- lezione. Ora restituisce anche l'ultimo giorno pagato di quel corso nella
-- stagione, così può ricordarlo a voce prima.
--
-- È l'ultimo giorno fra i periodi *pagati*, non fra quelli richiesti: una
-- richiesta ancora da confermare è un'intenzione, e mostrarla come copertura
-- direbbe al tecnico che il socio è a posto quando non lo è ancora.
--
-- Migrazione che aggiunge: va applicata prima del codice che legge la colonna.
-- Il codice attuale seleziona le colonne per nome e ignora quella nuova.
-- Cambiare le colonne restituite obbliga a ricreare la funzione, e con lei i
-- permessi: stanno qui sotto, nella stessa transazione.

drop function if exists public.partecipanti_miei_corsi();

create function public.partecipanti_miei_corsi()
returns table (
  attivita_id uuid,
  corso text,
  nome text,
  cognome text,
  certificato text,
  quota_in_regola boolean,
  in_attesa boolean,
  frequenza_fino_al date
)
  language sql stable security definer set search_path = public
as $$
  with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
  miei as (
    select c.id, c.nome_attivita
      from public.catalogo_attivita c
     where c.tipo = 'corso' and public.tecnico_segue_corso(c.id)
  ),
  iscritti as (
    select distinct ab.attivita_id, ab.socio_id
      from public.abbonamenti_soci ab
      join miei m on m.id = ab.attivita_id
     where ab.anno_sportivo = public.anno_sportivo_corrente()
       and ab.stato_pagamento in ('pagato', 'da_saldare')
  )
  select m.id,
         m.nome_attivita,
         s.nome,
         s.cognome,
         case
           when t.data_scadenza_certificato is null or t.data_scadenza_certificato < o.d then 'non_valido'
           when t.data_scadenza_certificato <= o.d + 30 then 'in_scadenza'
           else 'valido'
         end,
         exists (
           select 1 from public.abbonamenti_soci p
            where p.socio_id = i.socio_id
              and p.attivita_id = i.attivita_id
              and p.stato_pagamento = 'pagato'
              and p.data_inizio_validita <= o.d
              and p.data_fine_validita >= o.d
         ),
         exists (
           select 1 from public.abbonamenti_soci p
            where p.socio_id = i.socio_id
              and p.attivita_id = i.attivita_id
              and p.stato_pagamento = 'da_saldare'
         ),
         (
           select max(p.data_fine_validita) from public.abbonamenti_soci p
            where p.socio_id = i.socio_id
              and p.attivita_id = i.attivita_id
              and p.stato_pagamento = 'pagato'
              and p.anno_sportivo = public.anno_sportivo_corrente()
         )
    from iscritti i
    join miei m on m.id = i.attivita_id
    join public.soci s on s.id = i.socio_id
    cross join oggi o
    left join public.tesseramenti_annuali t
      on t.socio_id = i.socio_id and t.anno_sportivo = public.anno_sportivo_corrente()
   order by m.nome_attivita, s.cognome, s.nome;
$$;

revoke all on function public.partecipanti_miei_corsi() from public, anon;
grant execute on function public.partecipanti_miei_corsi() to authenticated, service_role;
