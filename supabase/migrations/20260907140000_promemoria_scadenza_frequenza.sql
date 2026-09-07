-- Il registro dei promemoria di scadenza del periodo di frequenza.
--
-- Serve a una cosa sola, ed è la più importante quando si scrive a delle
-- persone vere: **non scrivere due volte per la stessa scadenza.** Senza
-- questa tabella, un lavoro programmato che gira ogni giorno manderebbe lo
-- stesso promemoria ogni mattina per cinque giorni di fila.
--
-- ⚠️ La chiave è l'**abbonamento**, non il socio più la stagione come in
-- `invii_notifiche_certificato`. Il certificato è uno per stagione; i periodi
-- di frequenza no — chi compra il mensile ne ha undici in una stagione, e
-- ciascuno ha una sua scadenza a cui corrisponde un suo promemoria. Con la
-- chiave del certificato, il socio mensile sarebbe avvisato a settembre e mai
-- più fino all'agosto dopo.
create table if not exists public.invii_promemoria_frequenza (
  abbonamento_id uuid not null references public.abbonamenti_soci(id) on delete cascade,

  -- Quale promemoria: oggi ce n'è uno solo, ma il campo esiste perché
  -- aggiungerne un secondo (un sollecito il giorno stesso, per dire) non
  -- richieda di rifare la chiave primaria di una tabella già piena.
  tipo text not null,

  esito text not null,
  errore_messaggio text,

  -- L'esito per canale, come in `invii_notifiche_certificato`: un'email
  -- partita e un WhatsApp fallito non sono lo stesso caso di due fallimenti,
  -- e a distanza di mesi la differenza non si ricostruisce a memoria.
  canali jsonb not null default '{}'::jsonb,

  aggiornato_il timestamptz not null default now(),

  primary key (abbonamento_id, tipo),
  constraint promemoria_esito_valido check (esito in ('inviato', 'errore')),
  constraint promemoria_tipo_valido check (tipo in ('5_giorni'))
);

comment on table public.invii_promemoria_frequenza is
  'Quali promemoria di scadenza sono già partiti. Impedisce di riscrivere alla stessa persona per la stessa scadenza.';

-- La lettura che fa la funzione a ogni giro: quali abbonamenti sono già stati
-- avvisati con successo.
create index if not exists invii_promemoria_frequenza_riusciti_idx
  on public.invii_promemoria_frequenza (tipo, abbonamento_id)
  where esito = 'inviato';

alter table public.invii_promemoria_frequenza enable row level security;

-- Nessuna policy: ci scrive e ci legge solo la Edge Function, che usa la
-- chiave di servizio e scavalca le RLS. Un socio non ha niente da leggere
-- qui, e un gestore lo vede dalla Dashboard guardando le frequenze in
-- scadenza. Tabella con RLS attive e zero policy = chiusa a tutti gli altri.
