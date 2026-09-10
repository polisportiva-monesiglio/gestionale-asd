-- I gestori possono correggere l'anagrafica di un socio.
--
-- Fino a qui potevano leggere tutto ma non scrivere niente: le uniche policy
-- di UPDATE su `soci` erano quelle del socio su sé stesso. Una correzione
-- fatta da un gestore sarebbe stata respinta dalle RLS **senza errore**, con
-- zero righe toccate e la schermata che diceva "salvato".
--
-- Il permesso sta qui e non solo nel codice dell'applicazione perché così si
-- può verificare impersonando il ruolo, che è l'unico modo di provarlo:
--
--   gestore non amministratore -> corregge, 1 riga
--   socio su un altro socio    -> 0 righe
--   socio sul registro         -> respinto con errore
create policy "gestori_update_soci" on public.soci
  for update to authenticated
  using (is_gestore())
  with check (is_gestore());
