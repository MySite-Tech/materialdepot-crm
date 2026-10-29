import type { NextRequest } from 'next/server';
import { relayB2B } from '@/lib/server/b2b-backend';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return relayB2B(request, path);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return relayB2B(request, path, { method: 'POST', body });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return relayB2B(request, path, { method: 'DELETE' });
}
