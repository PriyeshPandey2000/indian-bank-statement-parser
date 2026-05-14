import type { UploadResponse, ParseResponse, ParseResultJson, PageRows, DocumentTransactions, PageColumnResult } from './types';

// All API calls go through Next.js rewrite proxy (/api/backend/* → localhost:8000/*)
const PROXY = '/api/backend';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function uploadPdf(file: File, password?: string): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  if (password) form.append('password', password);
  return request<UploadResponse>('/api/upload', { method: 'POST', body: form });
}

export async function parseDocument(documentId: string): Promise<ParseResponse> {
  return request<ParseResponse>(`/api/document/${documentId}/parse`, { method: 'POST' });
}

export async function getParsedData(documentId: string): Promise<ParseResultJson> {
  return request<ParseResultJson>(`/api/document/${documentId}/parsed`);
}

export function screenshotUrl(documentId: string, page: number): string {
  return `${PROXY}/api/document/${documentId}/screenshot/${page}`;
}

export async function reconstructRows(
  documentId: string,
  threshold?: number
): Promise<PageRows[]> {
  const url = threshold !== undefined
    ? `/api/document/${documentId}/reconstruct-rows?threshold=${threshold}`
    : `/api/document/${documentId}/reconstruct-rows`;
  const res = await request<{ rows: PageRows[] }>(url, { method: 'POST' });
  return res.rows;
}

export async function getRows(documentId: string): Promise<PageRows[]> {
  return request<PageRows[]>(`/api/document/${documentId}/rows`);
}

export async function detectTransactions(documentId: string): Promise<DocumentTransactions[]> {
  const res = await request<{ pages: DocumentTransactions[] }>(
    `/api/document/${documentId}/detect-transactions`,
    { method: 'POST' }
  );
  return res.pages;
}

export async function getTransactions(documentId: string): Promise<DocumentTransactions[]> {
  return request<DocumentTransactions[]>(`/api/document/${documentId}/transactions`);
}

export async function detectColumns(documentId: string): Promise<PageColumnResult[]> {
  const res = await request<{ pages: PageColumnResult[] }>(
    `/api/document/${documentId}/detect-columns`,
    { method: 'POST' }
  );
  return res.pages;
}

export async function getColumns(documentId: string): Promise<PageColumnResult[]> {
  return request<PageColumnResult[]>(`/api/document/${documentId}/columns`);
}

export function exportCsvUrl(documentId: string): string {
  return `${PROXY}/api/document/${documentId}/export/csv`;
}

export async function patchTransactions(
  documentId: string,
  edits: Array<{ id: number; date?: string; narration?: string; debit?: string; credit?: string; balance?: string }>
): Promise<DocumentTransactions[]> {
  return request<DocumentTransactions[]>(`/api/document/${documentId}/transactions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits }),
  });
}

export async function reconcile(documentId: string): Promise<DocumentTransactions[]> {
  return request<DocumentTransactions[]>(`/api/document/${documentId}/reconcile`, { method: 'POST' });
}
