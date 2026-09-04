/**
 * Le versioni dei testi che il socio sottoscrive, in un posto solo.
 *
 * Erano dichiarate tre volte: in `api/iscrizione`, in `api/rinnovo` e — quella
 * mostrata a schermo — in `privacy/page.tsx`. Tutte e tre a `v1.0_2026`, il
 * che nascondeva il problema invece di toglierlo: alzarne una sola avrebbe
 * legato i nuovi iscritti e i rinnovi a due versioni diverse dello stesso
 * regolamento, e lasciato l'informativa pubblicata a dichiarare una versione
 * che in `consensi` non risulta.
 *
 * Vanno alzate qui, e qui soltanto.
 *
 * `VERSIONE_REGOLAMENTO` va alzata **ogni volta che il testo cambia**, anche
 * per un chiarimento: non misura quanto la modifica sia importante, dice quale
 * testo una persona ha accettato. Se due testi diversi portano lo stesso
 * numero, alla domanda «cosa aveva firmato il socio X?» non si sa rispondere.
 *
 * Storia:
 * - `v1.0_2026` — prima stesura. Dieci soci l'hanno firmata il 3 settembre
 *   2026, fra le 14:02 e le 16 circa.
 * - `v1.1_2026` — 3 settembre 2026. Le modalità di pagamento ora ammettono
 *   anche i soggetti delegati dal Consiglio Direttivo ai sensi dell'art. 22
 *   dello Statuto, non i soli consiglieri: mette per iscritto una prassi già
 *   in uso. Non tocca obblighi né diritti del socio, quindi chi aveva già
 *   firmato non ha dovuto rifirmare.
 *
 * ⚠️ Chi alza questa costante deve anche **archiviare il PDF precedente**
 * sotto `public/regolamento-<versione>.pdf`. I consensi già registrati puntano
 * a quel testo: sostituirlo e basta lo farebbe sparire, e il consenso
 * rimanderebbe a un documento che non esiste piu'.
 *
 * Resta in attesa il nome del referente per la tutela (Safeguarding Officer):
 * il regolamento cita il ruolo ma non la persona né un recapito, e si aspetta
 * la UISP. Quando arriverà sarà una modifica sostanziale, non un chiarimento.
 */
export const VERSIONE_REGOLAMENTO = 'v1.1_2026'
export const VERSIONE_STATUTO = 'v1.0_2026'
export const VERSIONE_PRIVACY = 'v1.0_2026'
