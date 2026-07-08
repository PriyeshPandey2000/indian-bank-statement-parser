import fs from 'fs';
import path from 'path';
import { getDocumentDir } from '../utils/storage';

const DATALAB_BASE = 'https://www.datalab.to/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 150; // 5 minutes max

interface PipelineRunResponse {
  execution_id: string;
}

interface PipelineStatusResponse {
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface StepResultEnvelope {
  success: boolean;
  output_format: string;
  json: unknown;
}

export async function runChandraOcr(documentId: string, apiKey: string, pipelineId: string): Promise<unknown> {
  const docDir = getDocumentDir(documentId);
  const pdfFile = fs.readdirSync(docDir).find(f => f.toLowerCase().endsWith('.pdf'));
  if (!pdfFile) throw new Error(`No PDF in document dir: ${docDir}`);

  const pdfBuffer = fs.readFileSync(path.join(docDir, pdfFile));

  // Submit PDF to pipeline. Force JSON output — pipeline default may be markdown.
  const form = new FormData();
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), pdfFile);
  form.append('output_format', 'json');

  const runResp = await fetch(`${DATALAB_BASE}/pipelines/${pipelineId}/run`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
  });

  if (!runResp.ok) {
    throw new Error(`Chandra pipeline submit failed ${runResp.status}: ${await runResp.text()}`);
  }

  const { execution_id } = await runResp.json() as PipelineRunResponse;
  console.log(`[Chandra] execution_id=${execution_id}`);

  // Poll until completed
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusResp = await fetch(`${DATALAB_BASE}/pipelines/executions/${execution_id}`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!statusResp.ok) continue;

    const { status } = await statusResp.json() as PipelineStatusResponse;
    console.log(`[Chandra] attempt=${attempt + 1} status=${status}`);

    if (status === 'completed') break;
    if (status === 'failed') throw new Error(`Chandra pipeline execution ${execution_id} failed`);
  }

  // Fetch step 0 result (Chandra OCR JSON)
  const resultResp = await fetch(
    `${DATALAB_BASE}/pipelines/executions/${execution_id}/steps/0/result`,
    { headers: { 'X-API-Key': apiKey } },
  );

  if (!resultResp.ok) {
    throw new Error(`Failed to fetch Chandra result ${resultResp.status}: ${await resultResp.text()}`);
  }

  const envelope = await resultResp.json() as StepResultEnvelope;
  if (!envelope.json) {
    throw new Error(`Chandra returned no JSON (output_format=${envelope.output_format})`);
  }
  return envelope.json;
}
