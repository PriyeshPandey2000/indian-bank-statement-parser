'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPdf } from '@/lib/api';

type UploadState = 'idle' | 'staged' | 'uploading' | 'error';

interface Props {
  redirectBase?: string; // e.g. '/doc' or '/debug/viewer'
}

export default function UploadZone({ redirectBase = '/doc' }: Props) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>('idle');
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stageFile = useCallback((file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files accepted');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds 50MB limit');
      return;
    }
    setStagedFile(file);
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
  }, [stagedFile, password, router]);

  const reset = () => {
    setState('idle');
    setStagedFile(null);
    setPassword('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) stageFile(file);
  }, [stageFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) stageFile(file);
  }, [stageFile]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white mb-2">PDF Parser Debugger</h1>
        <p className="text-gray-400 text-sm mb-8">Upload bank statement PDF to inspect extraction</p>

        {state === 'idle' || state === 'error' ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={[
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
              dragOver
                ? 'border-blue-400 bg-blue-500/10'
                : state === 'error'
                ? 'border-red-500 bg-red-500/10'
                : 'border-gray-600 bg-gray-900 hover:border-gray-400 hover:bg-gray-800/50',
            ].join(' ')}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={onFileInput}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">📄</div>
              <div className="text-gray-200 font-medium">Drop PDF here or click to browse</div>
              <div className="text-gray-500 text-xs">PDF only · max 50MB</div>
            </div>
          </div>
        ) : state === 'uploading' ? (
          <div className="border-2 border-dashed border-blue-500/50 rounded-xl p-12 text-center bg-blue-500/5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-300 text-sm">Uploading {stagedFile?.name}…</span>
            </div>
          </div>
        ) : (
          /* staged state */
          <div className="border border-gray-700 rounded-xl bg-gray-900 overflow-hidden">
            {/* file info */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/60">
              <span className="text-xl">📄</span>
              <div className="flex-1 min-w-0">
                <div className="text-gray-200 text-sm font-medium truncate">{stagedFile!.name}</div>
                <div className="text-gray-500 text-xs">{formatSize(stagedFile!.size)}</div>
              </div>
              <button onClick={reset} className="text-gray-600 hover:text-gray-300 text-xs transition-colors">✕</button>
            </div>

            {/* password field */}
            <div className="px-4 py-3 border-b border-gray-700/60">
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                Password <span className="normal-case text-gray-600">(leave blank if not protected)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpload()}
                  placeholder="Enter PDF password…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs transition-colors"
                >
                  {showPassword ? 'hide' : 'show'}
                </button>
              </div>
            </div>

            {/* upload button */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px]">
                {password ? (
                  <>
                    <span className="text-yellow-500">🔒</span>
                    <span className="text-yellow-500/80">Password protected</span>
                  </>
                ) : (
                  <span className="text-gray-600">No password</span>
                )}
              </div>
              <button
                onClick={handleUpload}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
              >
                Upload & Parse
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
