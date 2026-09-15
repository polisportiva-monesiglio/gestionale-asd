-- Tecnici e corsi (15 settembre 2026).
--
-- Un istruttore deve vedere chi è iscritto ai propri corsi e confermarne i
-- pagamenti, senza vedere il resto: codice fiscale, data di nascita, recapiti,
-- dati del genitore, certificati. I permessi del database valgono su righe
-- intere e non su colonne, e fino a oggi dicevano solo "gestore" (vede tutto)
-- o "amministratore": un tecnico registrato come gestore con meno pulsanti
-- avrebbe avuto i dati sensibili a una chiamata di distanza. Per questo:
--
--   - una tabella `tecnici` a parte, che non passa mai da `is_gestore()`;
--   - nessun accesso diretto a `soci`, `tesseramenti_annuali`,
--     `abbonamenti_soci`: il tecnico legge solo attraverso due funzioni che
--     restituiscono le colonne ammesse, e solo per i propri corsi;
--   - la conferma del pagamento la esegue il server dopo aver verificato che la
--     richiesta sia di un corso del tecnico, e la numerazione della ricevuta
--     passa da una funzione che rifà la stessa verifica dentro il database.

-- 1. Il catalogo conosce i corsi.
alter table public.catalogo_attivita drop constraint if exists catalogo_attivita_tipo_check;
alter table public.catalogo_attivita add constraint catalogo_attivita_tipo_check
  check (tipo = any (array['abbonamento_mensile'::text, 'pacchetto_ingressi'::text, 'corso'::text]));

-- 2. I tecnici: una tabella a parte, mai dentro `gestori`.
create table if not exists public.tecnici (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text not null unique,
  nome text,
  telefono text,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

comment on table public.tecnici is
  'Istruttori dei corsi. Vedono solo i partecipanti dei propri corsi, attraverso partecipanti_miei_corsi() e richieste_miei_corsi(), e non passano da is_gestore().';

alter table public.tecnici enable row level security;
grant select, insert, update, delete on public.tecnici to authenticated;
grant all on public.tecnici to service_role;

create policy "tecnici select own" on public.tecnici
  for select to authenticated using (user_id = auth.uid());
create policy "tecnici select by gestori" on public.tecnici
  for select to authenticated using (public.is_gestore());
create policy "tecnici insert by admin" on public.tecnici
  for insert to authenticated with check (public.is_admin_gestore());
create policy "tecnici update by admin" on public.tecnici
  for update to authenticated using (public.is_admin_gestore()) with check (public.is_admin_gestore());
create policy "tecnici delete by admin" on public.tecnici
  for delete to authenticated using (public.is_admin_gestore());

-- Nessuna policy di "aggancio per indirizzo" come quella dei gestori: una
-- policy di UPDATE vincola le righe, non le colonne, e lascerebbe riscrivere
-- anche `attivo` a chi si aggancia. L'aggancio lo fa `aggancia_tecnico()`,
-- che scrive soltanto `user_id`.

-- 3. Chi tiene quale corso.
create table if not exists public.corsi_tecnici (
  attivita_id uuid not null references public.catalogo_attivita(id) on delete cascade,
  tecnico_id uuid not null references public.tecnici(id) on delete cascade,
  primary key (attivita_id, tecnico_id)
);

alter table public.corsi_tecnici enable row level security;
grant select, insert, update, delete on public.corsi_tecnici to authenticated;
grant all on public.corsi_tecnici to service_role;

create policy "corsi_tecnici gestori" on public.corsi_tecnici
  for all to authenticated using (public.is_gestore()) with check (public.is_gestore());
create policy "corsi_tecnici select own" on public.corsi_tecnici
  for select to authenticated
  using (tecnico_id in (select t.id from public.tecnici t where t.user_id = auth.uid()));

-- 4. Funzioni di appoggio.
create or replace function public.is_tecnico() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tecnici where user_id = auth.uid() and attivo = true);
$$;

create or replace function public.tecnico_segue_corso(p_attivita uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.corsi_tecnici ct
      join public.tecnici t on t.id = ct.tecnico_id
      join public.catalogo_attivita c on c.id = ct.attivita_id
     where ct.attivita_id = p_attivita
       and t.user_id = auth.uid()
       and t.attivo = true
       and c.tipo = 'corso'
  );
$$;

create or replace function public.aggancia_tecnico() returns boolean
  language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null then
    return false;
  end if;

  update public.tecnici
     set user_id = auth.uid()
   where lower(email) = v_email
     and user_id is null
     and attivo = true;

  return exists (select 1 from public.tecnici where user_id = auth.uid() and attivo = true);
end;
$$;

-- 5. Chi può chiedere il codice di accesso: anche un tecnico attivo.
create or replace function public.email_riconosciuta(p_email text) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.soci where lower(email) = lower(trim(p_email))
    union all
    select 1 from public.gestori where lower(email) = lower(trim(p_email)) and coalesce(attivo, true)
    union all
    select 1 from public.tecnici where lower(email) = lower(trim(p_email)) and attivo = true
  );
$$;

-- 6. Chi ha confermato un pagamento, quando è un tecnico. Il nome resta anche
--    scritto per esteso in `operatore`, come per i gestori.
alter table public.pagamenti_ricevute
  add column if not exists tecnico_id uuid references public.tecnici(id) on delete set null;

-- 7. Quello che il tecnico vede. Solo queste colonne, solo i propri corsi.
--    Il certificato è ridotto a tre stati, senza documento né data; "in
--    scadenza" usa la stessa soglia di 30 giorni dell'avviso automatico.
create or replace function public.partecipanti_miei_corsi()
returns table (
  attivita_id uuid,
  corso text,
  nome text,
  cognome text,
  certificato text,
  quota_in_regola boolean,
  in_attesa boolean
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
         )
    from iscritti i
    join miei m on m.id = i.attivita_id
    join public.soci s on s.id = i.socio_id
    cross join oggi o
    left join public.tesseramenti_annuali t
      on t.socio_id = i.socio_id and t.anno_sportivo = public.anno_sportivo_corrente()
   order by m.nome_attivita, s.cognome, s.nome;
$$;

-- Le richieste da confermare dei propri corsi. Qui compaiono anche importo,
-- metodo e note: servono a confermare, e sono della richiesta, non della
-- persona.
create or replace function public.richieste_miei_corsi()
returns table (
  abbonamento_id uuid,
  attivita_id uuid,
  corso text,
  nome text,
  cognome text,
  prezzo numeric,
  quota_tesseramento numeric,
  metodo text,
  richiesta_il timestamptz,
  inizio_scelto text,
  data_inizio date,
  data_fine date,
  note text
)
  language sql stable security definer set search_path = public
as $$
  select ab.id, c.id, c.nome_attivita, s.nome, s.cognome,
         c.prezzo_base, ab.importo_tesseramento_uisp, ab.metodo_pagamento, ab.data_acquisto,
         ab.inizio_scelto, ab.data_inizio_validita, ab.data_fine_validita, ab.note_socio
    from public.abbonamenti_soci ab
    join public.catalogo_attivita c on c.id = ab.attivita_id
    join public.soci s on s.id = ab.socio_id
   where ab.stato_pagamento = 'da_saldare'
     and c.tipo = 'corso'
     and public.tecnico_segue_corso(c.id)
   order by ab.data_acquisto;
$$;

-- 8. Il numero della ricevuta, quando conferma un tecnico.
--
-- Stesso contatore di `genera_numero_ricevuta`: le ricevute dell'associazione
-- sono una sequenza sola, chiunque le emetta. Le condizioni rifanno nel
-- database quello che il server ha già verificato — corso del tecnico,
-- richiesta già presa in carico, nessun numero già riservato, nessuna ricevuta
-- emessa — così chiamarla a mano non serve a bruciare numeri.
create or replace function public.genera_numero_ricevuta_corso(p_abbonamento uuid, p_anno integer)
returns text
  language plpgsql security definer set search_path = public
as $$
declare
  v_attivita uuid;
  v_numero integer;
begin
  select ab.attivita_id into v_attivita
    from public.abbonamenti_soci ab
   where ab.id = p_abbonamento
     and ab.stato_pagamento = 'pagato'
     and ab.numero_ricevuta_riservato is null
     and not exists (select 1 from public.pagamenti_ricevute r where r.abbonamento_id = ab.id);

  if v_attivita is null or not public.tecnico_segue_corso(v_attivita) then
    raise exception 'Solo il tecnico del corso puo'' emettere questa ricevuta'
      using errcode = '42501';
  end if;

  insert into public.contatori_ricevute (anno, ultimo)
  values (p_anno, 1)
  on conflict (anno) do update set ultimo = public.contatori_ricevute.ultimo + 1
  returning ultimo into v_numero;

  return 'RIC-' || p_anno || '-' || lpad(v_numero::text, 4, '0');
end;
$$;

-- 9. Le funzioni nuove non si chiamano da anonimi.
revoke all on function public.is_tecnico() from public, anon;
revoke all on function public.tecnico_segue_corso(uuid) from public, anon;
revoke all on function public.aggancia_tecnico() from public, anon;
revoke all on function public.partecipanti_miei_corsi() from public, anon;
revoke all on function public.richieste_miei_corsi() from public, anon;
revoke all on function public.genera_numero_ricevuta_corso(uuid, integer) from public, anon;

grant execute on function public.is_tecnico() to authenticated, service_role;
grant execute on function public.tecnico_segue_corso(uuid) to authenticated, service_role;
grant execute on function public.aggancia_tecnico() to authenticated, service_role;
grant execute on function public.partecipanti_miei_corsi() to authenticated, service_role;
grant execute on function public.richieste_miei_corsi() to authenticated, service_role;
grant execute on function public.genera_numero_ricevuta_corso(uuid, integer) to authenticated, service_role;
