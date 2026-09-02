-- I caricamenti di certificato non devono consumare il budget degli OTP.
--
-- `registra_upload_certificato` riusa la tabella `otp_invii`, e fin qui va
-- bene: stessa forma, stessa pulizia a 24 ore, e il prefisso nell'impronta
-- tiene separati i due conteggi. Il guaio era la colonna `ip`, che veniva
-- valorizzata: `registra_invio_otp` conta per provenienza *tutte* le righe con
-- quell'ip, senza guardare l'impronta, e il suo tetto e' 20 all'ora.
--
-- Cosi' dieci caricamenti bruciavano meta' del budget orario degli invii OTP.
-- Una serata di iscrizioni dalla wifi della palestra — o piu' famiglie dietro
-- lo stesso indirizzo dell'operatore mobile — esauriva il tetto e il sito
-- cominciava a rispondere "Troppe richieste da questa connessione" a chi
-- chiedeva il codice per firmare o per accedere.
--
-- L'ip non serviva comunque: questo contatore guarda l'impronta, che l'ip lo
-- contiene gia'.
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

  -- `ip` resta null di proposito: e' la colonna su cui conta il tetto degli
  -- invii OTP, e questi caricamenti non devono entrarci.
  insert into public.otp_invii (email_hash, ip) values (v_hash, null);
  return 'ok';
end;
$function$;

revoke execute on function public.registra_upload_certificato(text) from public, anon, authenticated;
grant execute on function public.registra_upload_certificato(text) to service_role;
