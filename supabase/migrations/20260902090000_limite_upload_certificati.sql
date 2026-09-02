-- Tetto agli invii di certificati, per provenienza.
--
-- Il caricamento del certificato avviene prima della firma, quindi prima che
-- esista un account: la policy che lo consente e' aperta al ruolo anonimo, e
-- davanti non c'e' niente. Con la sola chiave pubblica — che e' pubblica per
-- costruzione — si riempie l'archivio dell'ASD 10 MB per volta.
--
-- Il conteggio sta su Postgres e non in memoria per lo stesso motivo per cui
-- ci sta quello degli OTP: ogni richiesta puo' toccare un'istanza serverless
-- diversa, e un contatore locale non vedrebbe gli invii delle altre. Riusa la
-- tabella otp_invii, che ha gia' la forma giusta e la pulizia a 24 ore; il
-- prefisso nell'impronta tiene i due conteggi separati.
--
-- Le soglie sono larghe: un genitore che iscrive tre figli dallo stesso
-- collegamento, sbaglia un file e lo ricarica, non deve incontrarle.
create or replace function public.registra_upload_certificato(p_ip text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ora   integer;
  v_oggi  integer;
  c_max_ora  constant integer := 10;
  c_max_oggi constant integer := 30;
  v_hash text;
begin
  delete from public.otp_invii where creato_il < now() - interval '24 hours';

  -- Senza provenienza non si puo' contare: si lascia passare, perche' negare
  -- qui vorrebbe dire che basta far sparire l'intestazione per bloccare le
  -- iscrizioni di tutti.
  if p_ip is null or p_ip = 'non rilevato' then
    return 'ok';
  end if;

  v_hash := 'certificato:' || p_ip;

  select count(*) into v_ora
  from public.otp_invii
  where email_hash = v_hash and creato_il > now() - interval '1 hour';

  select count(*) into v_oggi
  from public.otp_invii
  where email_hash = v_hash and creato_il > now() - interval '24 hours';

  if v_ora >= c_max_ora or v_oggi >= c_max_oggi then
    return 'limite';
  end if;

  insert into public.otp_invii (email_hash, ip) values (v_hash, p_ip);
  return 'ok';
end;
$function$;

-- La chiama solo il server con la chiave di servizio: al browser non serve, e
-- lasciarla eseguibile darebbe modo di consumare da fuori il budget altrui.
revoke execute on function public.registra_upload_certificato(text) from public, anon, authenticated;
grant execute on function public.registra_upload_certificato(text) to service_role;
