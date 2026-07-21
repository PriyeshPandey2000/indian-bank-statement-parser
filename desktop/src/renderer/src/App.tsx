'use client'

import { useState, useEffect, useCallback } from 'react'
import { Upload, Download, Loader2, Plus, Search, X, Settings, Lock, Eye, EyeOff, FileText } from 'lucide-react'

declare global {
  interface Window {
    api: {
      getBackendPort: () => Promise<number>
    }
  }
}

interface DocMeta {
  documentId: string
  filename: string
  createdAt: string
}

interface Transaction {
  id: number
  date: string
  narration: string
  debit: string
  credit: string
  balance: string
  isSuspicious: boolean
  rawValues?: string[]
}

interface PageResult {
  page: number
  result: {
    transactions: Transaction[]
    directColumns?: string[]
    isDirectMode?: boolean
    bankProfileId: string
  }
}

type Status = 'idle' | 'staged' | 'uploading' | 'extracting' | 'done' | 'error'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function App() {
  const [port, setPort] = useState<number | null>(null)
  const portReady = port !== null
  const [licenseBlocked, setLicenseBlocked] = useState(false)
  const [licenseMessage, setLicenseMessage] = useState('')
  const [pagesUsed, setPagesUsed] = useState<number | null>(null)
  const [pagesLimit, setPagesLimit] = useState<number | null>(null)

  const [docs, setDocs] = useState<DocMeta[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageResult[]>([])
  const [fileName, setFileName] = useState('')

  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    window.api?.getBackendPort().then(setPort)
  }, [])

  const apiBase = port !== null ? `http://localhost:${port}/api` : null

  const checkEncrypted = useCallback(async (file: File): Promise<boolean> => {
    const decode = async (blob: Blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer())
    const chunk = Math.min(file.size, 100 * 1024)
    const head = await decode(file.slice(0, chunk))
    const tail = await decode(file.slice(Math.max(0, file.size - chunk)))
    return head.includes('/Encrypt') || tail.includes('/Encrypt')
  }, [])

  const loadDocs = useCallback(async () => {
    if (!apiBase) return
    try {
      const res = await fetch(`${apiBase}/documents`)
      if (res.ok) setDocs(await res.json())
    } catch {}
  }, [apiBase])

  useEffect(() => {
    if (portReady) loadDocs()
  }, [portReady, loadDocs])

  const selectDoc = useCallback(async (id: string, name: string) => {
    if (!apiBase) return
    setSelectedId(id)
    setFileName(name)
    setError('')
    setStatus('extracting')
    try {
      const res = await fetch(`${apiBase}/document/${id}/transactions`)
      if (!res.ok) throw new Error('No transactions yet')
      const data = await res.json() as PageResult[]
      setPages(data)
      setStatus('done')
    } catch (e) {
      setPages([])
      setStatus('idle')
    }
  }, [apiBase])

  const handleUpload = useCallback(async (overrideFile?: File, overridePassword?: string) => {
    if (!apiBase) return
    const file = overrideFile ?? stagedFile
    if (!file) return
    setStatus('uploading')
    try {
      const form = new FormData()
      form.append('file', file, file.name || 'upload.pdf')
      const pw = overridePassword ?? password
      if (pw) form.append('password', pw)
      const uploadRes = await fetch(`${apiBase}/upload`, { method: 'POST', body: form })
      if (uploadRes.status === 402) {
        const body = await uploadRes.json() as { error: string; reason?: string; pagesUsed?: number; pagesLimit?: number }
        if (body.pagesUsed !== undefined) setPagesUsed(body.pagesUsed)
        if (body.pagesLimit !== undefined) setPagesLimit(body.pagesLimit)
        setLicenseBlocked(true)
        setLicenseMessage(body.error)
        setStatus('idle')
        return
      }
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Upload failed')
      }
      const uploadData = await uploadRes.json() as { documentId: string; pagesUsed?: number; pagesLimit?: number }
      if (uploadData.pagesUsed !== undefined) setPagesUsed(uploadData.pagesUsed)
      if (uploadData.pagesLimit !== undefined) setPagesLimit(uploadData.pagesLimit)
      const id = uploadData.documentId
      setSelectedId(id)
      setStagedFile(null)
      await loadDocs()

      setStatus('extracting')
      const extractRes = await fetch(`${apiBase}/document/${id}/extract-transactions?mode=direct`, { method: 'POST' })
      if (!extractRes.ok) throw new Error('Extraction failed')
      const data = await extractRes.json() as { pages: PageResult[] }
      setPages(data.pages)
      setStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      setError(msg)
      // For encrypted PDFs keep the staged file so user can correct the password and retry.
      if (isEncrypted && stagedFile) {
        setStagedFile(file)
        setStatus('staged')
      } else {
        setStatus('error')
      }
    }
  }, [apiBase, stagedFile, password, loadDocs, isEncrypted])

  const handleFileDrop = useCallback(async (file: File) => {
    if (!apiBase) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Only PDF files supported'); return }
    setFileName(file.name)
    setError('')
    setPages([])
    setSelectedId(null)
    setPassword('')
    setShowPassword(false)
    const encrypted = await checkEncrypted(file)
    setIsEncrypted(encrypted)
    if (!encrypted) {
      await handleUpload(file, '')
    } else {
      setStagedFile(file)
      setStatus('staged')
    }
  }, [apiBase, checkEncrypted, handleUpload])

  const handleCancelStaged = useCallback(() => {
    setStagedFile(null)
    setIsEncrypted(false)
    setPassword('')
    setShowPassword(false)
    setStatus('idle')
    setFileName('')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileDrop(file)
  }, [handleFileDrop])

  const allTx = pages.flatMap(p => p.result.transactions)
  const isDirectMode = pages[0]?.result.isDirectMode ?? false
  const directColumns = pages[0]?.result.directColumns ?? []
  const headers = isDirectMode
    ? (directColumns.length ? directColumns : allTx[0]?.rawValues?.map((_, i) => `Col ${i + 1}`) ?? [])
    : ['Date', 'Narration', 'Debit', 'Credit', 'Balance']
  const filteredDocs = docs.filter(d => d.filename.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {licenseBlocked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center px-8">
            <div className="text-2xl">🔒</div>
            <div className="text-sm font-semibold text-neutral-200">Trial Limit Reached</div>
            <div className="text-xs text-neutral-500 leading-relaxed">{licenseMessage}</div>
            <a
              href="mailto:priyeshpandey2000@gmail.com"
              className="text-xs font-medium px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-all"
            >
              Contact Priyesh
            </a>
          </div>
        </div>
      )}
      {/* Titlebar */}
      <div className="h-9 flex items-center drag-region border-b border-neutral-800/60 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {/* 80px left padding reserves space for macOS traffic lights */}
        <div className="w-56 shrink-0 flex items-center gap-2" style={{ paddingLeft: 80 }}>
          <button
            type="button"
            className="text-xs font-semibold text-neutral-200 tracking-wide cursor-pointer hover:text-white transition-colors bg-transparent border-0 p-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => { setStatus('idle'); setPages([]); setFileName(''); setSelectedId(null); setIsEncrypted(false); setPassword(''); setShowPassword(false); setError('') }}
          >OpenParsed</button>
        </div>
        {fileName && (
          <span className="text-xs text-neutral-300 truncate">
            {fileName}{allTx.length > 0 && <span className="text-neutral-500"> · {allTx.length} transactions</span>}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-neutral-800/60 flex flex-col bg-[#161616]">
          <div className="h-4 shrink-0" />
          <div className="px-4 flex items-center gap-1.5" style={{ paddingTop: 2, paddingBottom: 8 }}>
            <div className="flex flex-1 items-center gap-1.5 rounded-md border border-neutral-700/60 bg-neutral-800/60 px-2 py-1.5">
              <Search size={11} className="text-neutral-600 shrink-0" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-neutral-300 placeholder:text-neutral-600 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-neutral-600 hover:text-neutral-400">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-3" style={{ paddingTop: 0, paddingLeft: 4, paddingRight: 4 }}>
            <div className="flex items-center justify-between" style={{ paddingLeft: 8, paddingRight: 6, paddingTop: 6, paddingBottom: 6 }}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Statements</span>
              <label
                title="Upload new PDF"
                tabIndex={0}
                className="rounded p-1 text-neutral-600 hover:text-neutral-400 hover:bg-neutral-700/50 transition-all cursor-pointer"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Plus size={11} />
                <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) handleFileDrop(f) }} />
              </label>
            </div>
            {filteredDocs.length === 0 && (
              <p className="text-[11px] text-neutral-600 text-center py-6">No statements yet</p>
            )}
            {filteredDocs.map(doc => {
              const name = doc.filename.replace(/\.pdf$/i, '')
              const parts = name.split(/[_\-\s]/).filter(Boolean)
              const title = parts.length > 1 ? parts.slice(0, 2).join(' ') : name
              const isActive = selectedId === doc.documentId
              return (
                <button
                  key={doc.documentId}
                  onClick={() => selectDoc(doc.documentId, doc.filename)}
                  className={`w-full flex items-center justify-between rounded-md py-2 transition-colors cursor-pointer ${isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-300'}`}
                  style={{ paddingLeft: 10, paddingRight: 10 }}
                >
                  <span className="text-[13px] truncate flex-1 text-left leading-snug">{title}</span>
                  <span className="text-[11px] text-neutral-600 shrink-0 ml-3 leading-snug">{timeAgo(doc.createdAt)}</span>
                </button>
              )
            })}
          </div>

          <div className="border-t border-neutral-800/60 px-3 py-2 flex flex-col gap-1.5">
            {pagesUsed !== null && pagesLimit !== null && (
              <div className="w-full">
                <div className="flex justify-between text-[10px] text-neutral-600 mb-1">
                  <span>{pagesUsed} / {pagesLimit} pages used</span>
                  <span>{pagesLimit - pagesUsed} left</span>
                </div>
                <div className="h-1 w-full rounded-full bg-neutral-800">
                  <div
                    className={`h-1 rounded-full transition-all ${pagesUsed / pagesLimit > 0.8 ? 'bg-orange-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min((pagesUsed / pagesLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <button className="flex items-center gap-2 text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer">
              <Settings size={11} />
              Settings
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {status === 'idle' || status === 'error' ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <label
                tabIndex={0}
                className="flex flex-col items-center justify-center gap-8 border border-dashed border-neutral-700/70 hover:border-blue-500/60 rounded-3xl cursor-pointer transition-all group hover:bg-neutral-900/30 w-full max-w-lg" style={{ minHeight: 320, padding: '60px 80px' }}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 group-hover:border-blue-500/30 transition-all">
                  <Upload size={28} className="text-neutral-500 group-hover:text-blue-400 transition-colors" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-neutral-200 tracking-tight">Drop a bank statement PDF</div>
                  <div className="text-xs text-neutral-600 mt-1.5">or click to browse</div>
                </div>
                <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) handleFileDrop(f) }} />
                {error && <div className="text-red-400 text-xs mt-1">{error}</div>}
              </label>
            </div>
          ) : status === 'staged' ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-5 w-full max-w-sm">
                <div className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800">
                  <FileText size={18} className="text-neutral-500 shrink-0" />
                  <span className="text-sm text-neutral-300 truncate">{fileName}</span>
                </div>

                {isEncrypted && (
                  <div className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <Lock size={14} className="text-amber-400 shrink-0" />
                    <span className="text-xs text-amber-400">Password-protected PDF detected</span>
                  </div>
                )}

                <div className="w-full">
                  <label className="block text-[11px] font-medium text-neutral-500 uppercase tracking-widest mb-2">
                    PDF Password{!isEncrypted && <span className="normal-case font-normal tracking-normal text-neutral-600"> — skip if not protected</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUpload() } }}
                      placeholder={isEncrypted ? 'Enter PDF password…' : 'Enter password…'}
                      autoFocus={isEncrypted}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-neutral-600 transition-colors pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 p-1 transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-neutral-600">
                    {password
                      ? <><Lock size={10} className="text-amber-500" /><span className="text-amber-500/80">Password set</span></>
                      : isEncrypted
                        ? <span className="text-amber-600">Password required</span>
                        : 'No password'
                    }
                  </div>
                </div>

                {error && <div className="text-red-400 text-xs w-full">{error}</div>}

                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={handleCancelStaged}
                    className="flex-1 text-xs font-medium px-4 py-2.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpload()}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer"
                  >
                    <Upload size={13} />
                    Upload
                  </button>
                </div>
              </div>
            </div>
          ) : status === 'uploading' || status === 'extracting' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="text-blue-400 animate-spin" />
              <div className="text-sm text-neutral-400">
                {status === 'uploading' ? 'Uploading…' : 'Extracting transactions…'}
              </div>
              {fileName && <div className="text-xs text-neutral-600">{fileName}</div>}
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 flex items-center justify-between py-3 border-b border-neutral-800/60 bg-neutral-900/80" style={{ paddingLeft: 20, paddingRight: 24 }}>
                <span className="text-xs font-medium text-neutral-400">{allTx.length} transactions · {pages.length} page{pages.length !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-2" style={{ marginRight: 20 }}>
                  <button
                    onClick={() => { setStatus('idle'); setPages([]); setFileName(''); setSelectedId(null); setIsEncrypted(false); setPassword(''); setShowPassword(false); setError('') }}
                    className="text-xs font-medium py-2 rounded-md border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700/80 hover:border-neutral-600 text-neutral-300 transition-all cursor-pointer"
                    style={{ paddingLeft: 16, paddingRight: 16 }}
                  >
                    New file
                  </button>
                  <a
                    href={`${apiBase}/document/${selectedId}/export/csv`}
                    download
                    className="flex items-center gap-2 text-xs font-medium py-2 rounded-md border border-blue-500/60 bg-blue-600/90 hover:bg-blue-500 hover:border-blue-400 text-white transition-all cursor-pointer"
                    style={{ paddingLeft: 16, paddingRight: 16 }}
                  >
                    <Download size={12} />
                    Export CSV
                  </a>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto" style={{ overflowX: 'auto' }}>
                <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-neutral-700/60 bg-neutral-900/95 backdrop-blur-sm">
                      {headers.map((h, i) => (
                        <th key={i} className={`py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 whitespace-nowrap ${i === 0 ? 'pl-5 pr-3' : i === headers.length - 1 ? 'px-3 pr-6' : 'px-3'}`}>
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allTx.map((tx, idx) => (
                      <tr
                        key={tx.id}
                        className={`border-b border-neutral-700/50 hover:bg-neutral-800/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-neutral-900/20'} ${tx.isSuspicious ? 'border-l-2 border-l-orange-500' : ''}`}
                      >
                        {isDirectMode && tx.rawValues ? (
                          tx.rawValues.map((val, i) => (
                            <td key={i} className={`${i === 0 ? 'pl-5 pr-3' : 'px-3'} py-2 text-neutral-300 whitespace-nowrap truncate max-w-xs`} title={val}>
                              {val || <span className="text-neutral-700">—</span>}
                            </td>
                          ))
                        ) : (
                          <>
                            <td className="pl-5 pr-3 py-2 font-mono text-neutral-400 whitespace-nowrap">{tx.date}</td>
                            <td className="px-3 py-2 text-neutral-200 max-w-xs truncate" title={tx.narration}>{tx.narration}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap tabular-nums">{tx.debit || <span className="text-neutral-700">—</span>}</td>
                            <td className="px-3 py-2 text-right text-green-400 font-mono whitespace-nowrap tabular-nums">{tx.credit || <span className="text-neutral-700">—</span>}</td>
                            <td className="px-3 pr-6 py-2 text-right text-neutral-400 font-mono whitespace-nowrap tabular-nums">{tx.balance || <span className="text-neutral-700">—</span>}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
