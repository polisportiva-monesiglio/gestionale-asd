import type { NextConfig } from "next";

// L'origine Supabase la legge il browser: la sessione di auth e il caricamento
// dei certificati partono dal client, quindi senza questa voce in connect-src
// la CSP bloccherebbe il login. Viene dall'ambiente, non incollata a mano, così
// non resta indietro se il progetto cambia.
const origineSupabase = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
})();

const inSviluppo = process.env.NODE_ENV === "development";

// CSP senza nonce, di proposito: la variante col nonce impone il rendering
// dinamico a ogni pagina (lo dice la guida di Next 16), e qui non vale il
// prezzo. 'unsafe-inline' sugli script resta il punto debole, mitigato dal
// fatto che in tutto il progetto non c'e' un solo dangerouslySetInnerHTML e
// React sfugge da solo i dati dei soci.
// 'unsafe-eval' serve solo in sviluppo: React lo usa per ricostruire gli stack
// di errore del server nel browser.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${inSviluppo ? " 'unsafe-eval'" : ""}`,
  // Tailwind e Next iniettano stili inline: senza questo la pagina resta nuda.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Inter e' autoospitato, nessun font esterno.
  "font-src 'self'",
  `connect-src 'self'${origineSupabase ? ` ${origineSupabase}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  // Il modulo di iscrizione posta solo sulle nostre API.
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const intestazioniSicurezza = [
  { key: "Content-Security-Policy", value: csp },
  // Due anni, come raccomandato. Niente 'preload': iscriversi alla lista dei
  // browser e' una scelta difficile da revocare, va fatta a mente fredda.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ridondante rispetto a frame-ancestors, ma copre i browser vecchi.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Non regaliamo la versione del framework a chi cerca bersagli noti.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: intestazioniSicurezza }];
  },
};

export default nextConfig;
