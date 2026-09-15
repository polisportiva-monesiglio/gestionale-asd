-- Chi tiene un corso lo decide un amministratore (15 settembre 2026).
--
-- Assegnare un tecnico a un corso gli apre i nomi dei partecipanti e la
-- conferma dei loro pagamenti: è la stessa decisione di crearlo, che era già
-- riservata agli amministratori. Fino a oggi la policy `corsi_tecnici gestori`
-- lasciava scrivere qualunque gestore, dal catalogo.
--
-- Leggere le assegnazioni resta a tutti i gestori: il catalogo mostra chi
-- tiene ogni corso, e chi non è amministratore deve sapere che quelle
-- richieste le conferma un tecnico.
--
-- Migrazione che restringe: va applicata DOPO il rilascio del codice che non
-- fa più scrivere le assegnazioni ai gestori non amministratori. Prima,
-- salvare una voce di catalogo da quell'account darebbe errore.

drop policy if exists "corsi_tecnici gestori" on public.corsi_tecnici;

create policy "corsi_tecnici select gestori" on public.corsi_tecnici
  for select to authenticated using (public.is_gestore());
create policy "corsi_tecnici insert admin" on public.corsi_tecnici
  for insert to authenticated with check (public.is_admin_gestore());
create policy "corsi_tecnici update admin" on public.corsi_tecnici
  for update to authenticated using (public.is_admin_gestore()) with check (public.is_admin_gestore());
create policy "corsi_tecnici delete admin" on public.corsi_tecnici
  for delete to authenticated using (public.is_admin_gestore());
