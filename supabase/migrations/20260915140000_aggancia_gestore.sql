-- L'aggancio del gestore al proprio account, fatto da una funzione.
--
-- Fino a oggi lo faceva un UPDATE permesso dalla policy "gestori claim by
-- email": USING (user_id is null and email = email del token) WITH CHECK
-- (user_id = auth.uid()). Una policy vincola le righe, non le colonne: nella
-- stessa UPDATE un gestore invitato, prima del primo accesso, poteva scrivere
-- anche `is_admin = true` o `attivo = true`. Provato il 15 settembre 2026 in
-- una transazione annullata: una riga aggiornata, amministratore.
--
-- Questa funzione scrive soltanto `user_id`. Si applica prima del codice che
-- la chiama; le policy vecchie si tolgono dopo il rilascio, in una migrazione
-- a parte.
create or replace function public.aggancia_gestore() returns boolean
  language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null then
    return false;
  end if;

  update public.gestori
     set user_id = auth.uid()
   where lower(email) = v_email
     and user_id is null
     and coalesce(attivo, true);

  return exists (
    select 1 from public.gestori where user_id = auth.uid() and coalesce(attivo, true)
  );
end;
$$;

revoke all on function public.aggancia_gestore() from public, anon;
grant execute on function public.aggancia_gestore() to authenticated, service_role;
