export interface JsonTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
  confidence?: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ParsedPageJson {
  page: number;
  width: number;
  height: number;
  text: string;
  textItems: JsonTextItem[];
  boundingBoxes: BoundingBox[];
}

export interface ParseResultJson {
  pages: ParsedPageJson[];
}

export interface ParseResponse {
  documentId: string;
  pageCount: number;
  screenshotCount: number;
  status: string;
}

export interface UploadResponse {
  documentId: string;
}

// Column detection
export type ColumnType = 'DATE' | 'CHQ' | 'NARRATION' | 'DEBIT' | 'CREDIT' | 'BALANCE' | 'UNKNOWN';

export interface ColumnDefinition {
  type: ColumnType;
  label: string;
  xStart: number;
  xEnd: number;
  centerX: number;
}

export interface ColumnDetectionResult {
  columns: ColumnDefinition[];
  pageWidth: number;
}

export interface PageColumnResult {
  page: number;
  columns: ColumnDetectionResult;
}

// Transaction detection
export type RowType = 'HEADER' | 'TRANSACTION' | 'CONTINUATION' | 'OTHER';

export interface ClassifiedRow {
  row: ReconstructedRow;
  type: RowType;
}

export interface DetectedTransaction {
  id: number;
  date: string;
  narration: string;
  rawText: string;
  sourceRows: number[];
  debit: string;
  credit: string;
  balance: string;
  isSuspicious: boolean;
  suspiciousReason?: string;
}

export interface TransactionDetectionResult {
  classifiedRows: ClassifiedRow[];
  transactions: DetectedTransaction[];
  headerRowId: number | null;
  bankProfileId: string;
}

export interface DocumentTransactions {
  page: number;
  result: TransactionDetectionResult;
}

// Row reconstruction
export interface ReconstructedRow {
  rowId: number;
  items: JsonTextItem[];
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface PageRows {
  page: number;
  rows: ReconstructedRow[];
}
