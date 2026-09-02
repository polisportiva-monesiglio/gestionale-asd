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
 * `VERSIONE_REGOLAMENTO` va alzata quando il regolamento cambia davvero. Al
 * 2 settembre 2026 il testo pubblicato cita il referente per la tutela
 * (Safeguarding Officer) come ruolo ma non ne dà il nome né un recapito: si
 * aspetta la UISP. Quando il nome arriverà, il PDF in `public/regolamento.pdf`
 * e questa costante si cambiano insieme.
 */
export const VERSIONE_REGOLAMENTO = 'v1.0_2026'
export const VERSIONE_STATUTO = 'v1.0_2026'
export const VERSIONE_PRIVACY = 'v1.0_2026'
