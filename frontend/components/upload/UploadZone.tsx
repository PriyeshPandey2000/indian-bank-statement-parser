'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPdf } from '@/lib/api';

type UploadState = 'idle' | 'staged' | 'uploading' | 'error';

interface Props {
  redirectBase?: string;
}

const BANKS = ['Axis Bank', 'HDFC', 'ICICI', 'SBI', 'Kotak', 'PNB', 'BOB'];

const STEPS = [
  { n: '01', title: 'Upload PDF', body: 'Drop your bank statement — any format, any bank, password-protected supported.' },
  { n: '02', title: 'AI Extracts', body: 'LLM reads every page, identifies transactions, verifies balance chain automatically.' },
  { n: '03', title: 'Download CSV', body: 'Clean structured data ready for Excel, Tally, or any accounting software.' },
];

const PREVIEW_ROWS = [
  { date: '01-01-2026', narration: 'SB INT.PD:01-10-2025 TO 31-12-2025', debit: '',        credit: '1.00',  balance: '1.00',  ok: true },
  { date: '10-01-2026', narration: 'AVG BAL CHGS INCL GST NOV-25',        debit: '1.00',   credit: '',      balance: '0.00',  ok: true },
  { date: '15-01-2026', narration: 'UPI TRANSFER FROM JIYA KUMA',          debit: '',       credit: '23.00', balance: '23.00', ok: true },
  { date: '15-01-2026', narration: 'UPI TO MERCHANT : ANGEL ONE LIMITED',  debit: '23.00',  credit: '',      balance: '0.00',  ok: true },
  { date: '17-01-2026', narration: 'IMPS TRANSFER FROM ID: APIBANKI',      debit: '',       credit: '1.00',  balance: '1.00',  ok: true },
  { date: '19-01-2026', narration: 'AVG BAL CHGS INCL GST NOV-25',        debit: '1.00',   credit: '',      balance: '0.00',  ok: true },
];

export default function UploadZone({ redirectBase = '/doc' }: Props) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>('idle');
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkEncrypted = async (file: File): Promise<boolean> => {
    const checkChunk = async (blob: Blob) =>
      new TextDecoder('latin1').decode(await blob.arrayBuffer());
    const chunkSize = Math.min(file.size, 100 * 1024);
    const start = await checkChunk(file.slice(0, chunkSize));
    const end = await checkChunk(file.slice(Math.max(0, file.size - chunkSize)));
    return start.includes('/Encrypt') || end.includes('/Encrypt');
  };

  const stageFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Only PDF files are accepted'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('File exceeds 50 MB limit'); return; }
    const encrypted = await checkEncrypted(file);
    setStagedFile(file);
    setIsEncrypted(encrypted);
    setPassword('');
    setError(null);
    setState('staged');
  }, []);

  const handleUpload = useCallback(async () => {
    if (!stagedFile) return;
    setState('uploading');
    setError(null);
    try {
      const { documentId } = await uploadPdf(stagedFile, password || undefined);
      router.push(`${redirectBase}/${documentId}`);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [stagedFile, password, router, redirectBase]);

  const reset = () => {
    setState('idle');
    setStagedFile(null);
    setPassword('');
    setIsEncrypted(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) stageFile(file);
  }, [stageFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) stageFile(file);
  }, [stageFile]);

  const formatSize = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="bg-[#0a0a0f] text-white">

      {/* ── Background glows ───────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* blue — top left */}
        <div className="absolute top-[-10%] left-[-5%] w-[700px] h-[600px] bg-blue-700/22 rounded-full blur-[130px]" />
        {/* emerald — top right */}
        <div className="absolute top-[-15%] right-[-5%] w-[600px] h-[500px] bg-emerald-600/22 rounded-full blur-[120px]" />
        {/* emerald — mid right */}
        <div className="absolute top-[30%] right-[-8%] w-[450px] h-[400px] bg-emerald-500/12 rounded-full blur-[100px]" />
        {/* blue — center behind card */}
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-blue-600/10 rounded-full blur-[100px]" />
        {/* dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 px-8 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 bg-[#0a0a0f]/80 backdrop-blur-md">
        <span className="font-semibold text-sm tracking-tight">OpenParsed</span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/8 bg-white/3">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-gray-500 text-[11px]">AI-powered extraction</span>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-[calc(100vh-53px)] flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-[480px]">

          <div className="text-center mb-8">
            <h1 className="text-[46px] font-bold tracking-[-0.03em] leading-[1.1] mb-4">
              Turn bank statements<br />into CSV
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
              Made for Indian bank statements. Get structured, verified transactions — ready for Excel or audit.
            </p>
          </div>

          {/* Upload card */}
          <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm shadow-2xl shadow-black/50 overflow-hidden">
            {state === 'idle' || state === 'error' ? (
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => inputRef.current?.click()}
                className={[
                  'relative flex flex-col items-center justify-center gap-4 p-10 cursor-pointer transition-all select-none',
                  dragOver ? 'bg-blue-500/8' : 'hover:bg-white/2',
                ].join(' ')}
              >
                {dragOver
                  ? <div className="absolute inset-0 border-2 border-dashed border-blue-500/50 rounded-2xl pointer-events-none" />
                  : <div className="absolute inset-0 border-2 border-dashed border-white/6 rounded-2xl pointer-events-none" />
                }
                <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileInput} />
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${dragOver ? 'bg-blue-500/20 scale-110' : 'bg-white/5'}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={dragOver ? 'text-blue-400' : 'text-gray-400'}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium mb-1 transition-colors ${dragOver ? 'text-blue-300' : 'text-gray-200'}`}>
                    {dragOver ? 'Release to upload' : 'Drop your PDF here'}
                  </p>
                  <p className="text-gray-600 text-xs">or <span className="text-gray-400 underline underline-offset-2">click to browse</span> · PDF only · max 50 MB</p>
                </div>
              </div>

            ) : state === 'uploading' ? (
              <div className="flex flex-col items-center justify-center gap-5 p-10">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="absolute -inset-1 rounded-2xl bg-blue-500/5 animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-gray-200 text-sm font-medium mb-1">Uploading & parsing…</p>
                  <p className="text-gray-600 text-xs max-w-[260px] truncate">{stagedFile?.name}</p>
                </div>
              </div>

            ) : (
              <>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6">
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm font-medium truncate">{stagedFile!.name}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{formatSize(stagedFile!.size)}</p>
                  </div>
                  <button onClick={reset} className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 1l8 8M9 1L1 9" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <div className={`px-5 py-4 border-b ${isEncrypted ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-white/6'}`}>
                  {isEncrypted && (
                    <div className="flex items-center gap-2 mb-3 text-[11px] text-yellow-400/90">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      Password-protected PDF detected
                    </div>
                  )}
                  <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-widest mb-2.5">
                    PDF Password {!isEncrypted && <span className="normal-case font-normal tracking-normal text-gray-600">— skip if not protected</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpload()}
                      placeholder={isEncrypted ? 'Enter PDF password…' : 'Enter password…'}
                      autoFocus={isEncrypted}
                      className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none pr-14 transition-colors ${isEncrypted ? 'border-yellow-500/30 focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-500/20' : 'border-white/8 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'}`}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
                      {showPassword ? 'hide' : 'show'}
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    {password ? <><span className="text-yellow-500">🔒</span><span className="text-yellow-500/80">Password set</span></> : isEncrypted ? <span className="text-yellow-600">Password required</span> : 'No password'}
                  </div>
                  <button onClick={handleUpload} className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30 hover:-translate-y-px">
                    Analyse
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/25 text-red-400 text-sm">{error}</div>
          )}

        </div>

        {/* Scroll hint */}
        <button
          onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-gray-700 hover:text-gray-400 transition-colors cursor-pointer"
        >
          <span className="text-[11px] tracking-widest uppercase">See how it works</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-bounce">
            <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 px-6 py-24 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] uppercase tracking-[0.15em] text-gray-400 mb-3">How it works</p>
            <h2 className="text-2xl font-bold tracking-tight">Three steps, no configuration</h2>
          </div>

          <div className="grid grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[#111118] px-8 py-8">
                <div className="text-[11px] font-mono text-blue-400/80 mb-4 tracking-widest">{s.n}</div>
                <div className="text-base font-semibold text-white mb-2">{s.title}</div>
                <div className="text-gray-300 text-sm leading-relaxed">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Output preview ──────────────────────────────────────────────── */}
      <section className="relative z-10 px-6 py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] uppercase tracking-[0.15em] text-gray-600 mb-3">Output</p>
            <h2 className="text-2xl font-bold tracking-tight">Exactly what you get</h2>
            <p className="text-gray-500 text-sm mt-3">Every transaction with date, narration, debit, credit, and running balance — verified.</p>
          </div>

          {/* Mock product window */}
          <div className="rounded-2xl border border-white/8 overflow-hidden shadow-2xl shadow-black/60">
            {/* Window chrome */}
            <div className="bg-gray-900 px-4 py-3 border-b border-white/6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-gray-500">6 transactions</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-500">01-01-2026 – 19-01-2026</span>
                <span className="text-gray-700">·</span>
                <span className="text-green-500/70">✓ reconciled</span>
                <div className="ml-2 px-2.5 py-1 rounded-lg bg-gray-800 text-gray-400 text-[11px] cursor-default">↓ CSV</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#0d0d14]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600">Date</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 w-full">Narration</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-600">Debit</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-600">Credit</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-600">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map((row, i) => (
                    <tr key={i} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3 text-gray-500 font-mono whitespace-nowrap">{row.date}</td>
                      <td className="px-5 py-3 text-gray-300 max-w-0 w-full">
                        <span className="truncate block">{row.narration}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-red-400 whitespace-nowrap">
                        {row.debit ? row.debit : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-green-400 whitespace-nowrap">
                        {row.credit ? row.credit : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-gray-400 whitespace-nowrap">{row.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 px-8 py-6 flex items-center justify-between">
        <span className="text-gray-700 text-xs">© 2026 OpenParsed</span>
        <span className="text-gray-700 text-xs">For accountants, CAs &amp; auditors</span>
      </footer>

    </div>
  );
}
