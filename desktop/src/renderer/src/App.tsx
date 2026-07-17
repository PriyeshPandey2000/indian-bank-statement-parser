'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Upload, Download, Loader2 } from 'lucide-react'

declare global {
  interface Window {
    api: {
      onBackendPort: (cb: (port: number) => void) => void
    }
  }
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

type Status = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

const DEV_PORT = 3001

export default function App() {
  const [port, setPort] = useState(DEV_PORT)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [pages, setPages] = useState<PageResult[]>([])
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    window.api?.onBackendPort((p) => setPort(p))
  }, [])

  const apiBase = `http://localhost:${port}/api`

  const allTx = pages.flatMap(p => p.result.transactions)
  const isDirectMode = pages[0]?.result.isDirectMode ?? false
  const directColumns = pages[0]?.result.directColumns ?? []

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setError('Only PDF files supported')
      return
    }
    setFileName(file.name)
    setError('')
    setPages([])
    setStatus('uploading')

    try {
      // Upload
      const form = new FormData()
      form.append('pdf', file)
      const uploadRes = await fetch(`${apiBase}/documents`, { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { documentId: id } = await uploadRes.json() as { documentId: string }
      setDocumentId(id)

      // Extract (direct mode — no LLM)
      setStatus('extracting')
      const extractRes = await fetch(`${apiBase}/documents/${id}/extract?mode=direct`, { method: 'POST' })
      if (!extractRes.ok) throw new Error('Extraction failed')
      const data = await extractRes.json() as { pages: PageResult[] }
      setPages(data.pages)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('error')
    }
  }, [apiBase])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const exportCsv = () => {
    window.open(`${apiBase}/documents/${documentId}/export/csv`, '_blank')
  }

  const headers = isDirectMode ? directColumns : ['Date', 'Description', 'Debit', 'Credit', 'Balance']

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200">
      {/* Titlebar drag region */}
      <div className="h-10 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <FileText size={14} className="text-blue-400 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
        <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase">OpenParsed</span>
        {fileName && <span className="text-xs text-gray-600 truncate">{fileName}</span>}
        {allTx.length > 0 && (
          <span className="ml-auto text-xs text-gray-500" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {allTx.length} transactions
          </span>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {status === 'idle' || status === 'error' ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <label
              className="flex flex-col items-center gap-4 border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-16 cursor-pointer transition-colors group"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <Upload size={40} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
              <div className="text-center">
                <div className="text-gray-300 font-medium">Drop bank statement PDF here</div>
                <div className="text-gray-600 text-sm mt-1">or click to browse</div>
              </div>
              <input type="file" accept=".pdf" className="hidden" onChange={handleInputChange} />
              {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
            </label>
          </div>
        ) : status === 'uploading' || status === 'extracting' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 size={32} className="text-blue-400 animate-spin" />
            <div className="text-gray-400 text-sm">
              {status === 'uploading' ? 'Uploading PDF…' : 'Extracting transactions…'}
            </div>
            {fileName && <div className="text-gray-600 text-xs">{fileName}</div>}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{allTx.length} transactions · {pages.length} page{pages.length !== 1 ? 's' : ''}</span>
                {isDirectMode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                    No LLM
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setStatus('idle'); setPages([]); setFileName(''); setDocumentId('') }}
                  className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  New file
                </button>
                <button
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 text-xs px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors"
                >
                  <Download size={12} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-900 z-10">
                  <tr className="border-b border-gray-700">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTx.map((tx, idx) => (
                    <tr
                      key={tx.id}
                      className={`border-b border-gray-800/60 transition-colors hover:bg-gray-800/50 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-900/40'} ${tx.isSuspicious ? 'border-l-2 border-l-orange-500' : ''}`}
                    >
                      {isDirectMode && tx.rawValues ? (
                        tx.rawValues.map((val, i) => (
                          <td key={i} className="px-3 py-2 text-gray-200 whitespace-nowrap truncate max-w-xs" title={val}>
                            {val || <span className="text-gray-700">·</span>}
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="px-3 py-2 font-mono text-gray-300 whitespace-nowrap">{tx.date}</td>
                          <td className="px-3 py-2 text-gray-200 max-w-xs truncate" title={tx.narration}>{tx.narration}</td>
                          <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap">{tx.debit || '·'}</td>
                          <td className="px-3 py-2 text-right text-green-400 font-mono whitespace-nowrap">{tx.credit || '·'}</td>
                          <td className="px-3 py-2 text-right text-gray-300 font-mono whitespace-nowrap">{tx.balance || '·'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
