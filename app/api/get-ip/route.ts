// app/api/get-ip/route.ts
import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // In Next.js App Router, leggiamo le intestazioni direttamente dall'oggetto request
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  // Estraiamo l'IP pulito. Fallback su 'IP_Sconosciuto' se si lavora in locale senza Vercel
  const ip = forwardedFor ? forwardedFor.split(',')[0] : realIp || 'IP_Sconosciuto';
  
  return NextResponse.json({ ip });
}