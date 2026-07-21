import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

function getQpdfBinary(): string {
  // In packaged Electron app, RESOURCES_PATH is injected by main process
  const resourcesPath = process.env['RESOURCES_PATH'];
  if (resourcesPath) {
    const bin = process.platform === 'win32'
      ? path.join(resourcesPath, 'bin', 'qpdf.exe')
      : path.join(resourcesPath, 'bin', 'qpdf');
    if (fs.existsSync(bin)) return bin;
  }
  // Dev: use system qpdf
  return 'qpdf';
}

export async function decryptPdf(inputPath: string, password: string): Promise<Buffer> {
  const tmpOut = path.join(os.tmpdir(), `decrypted-${crypto.randomBytes(8).toString('hex')}.pdf`);
  const qpdf = getQpdfBinary();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(qpdf, [
      `--password=${password}`,
      '--decrypt',
      inputPath,
      tmpOut,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`qpdf exit ${code}: ${stderr.trim()}`));
    });
    proc.on('error', reject);
  });

  const buf = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpOut);
  return buf;
}

export async function isPdfEncrypted(inputPath: string): Promise<boolean> {
  const qpdf = getQpdfBinary();
  const code = await new Promise<number>((resolve) => {
    const proc = spawn(qpdf, ['--is-encrypted', inputPath]);
    proc.on('close', resolve);
    proc.on('error', () => resolve(-1));
  });
  // exit 0 = encrypted, exit 2 = not encrypted
  return code === 0;
}
