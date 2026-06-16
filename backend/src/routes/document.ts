import { Router } from 'express';
import { parseDocument, getParseResult, getScreenshot } from '../controllers/parseController';
import { reconstructDocumentRows, getDocumentRows } from '../controllers/rowController';
import { detectDocumentTransactions, getDocumentTransactions, patchDocumentTransactions, reconcileDocumentTransactions } from '../controllers/transactionController';
import { detectDocumentColumns, getDocumentColumns } from '../controllers/columnController';
import { exportDocumentCsv } from '../controllers/exportController';
import { extractTransactionsLlm } from '../controllers/llmTransactionController';

const router = Router();

router.post('/:id/parse', parseDocument);
router.post('/:id/extract-transactions-llm', extractTransactionsLlm);
router.get('/:id/parsed', getParseResult);
router.get('/:id/screenshot/:page', getScreenshot);
router.post('/:id/reconstruct-rows', reconstructDocumentRows);
router.get('/:id/rows', getDocumentRows);
router.post('/:id/detect-transactions', detectDocumentTransactions);
router.get('/:id/transactions', getDocumentTransactions);
router.patch('/:id/transactions', patchDocumentTransactions);
router.post('/:id/reconcile', reconcileDocumentTransactions);
router.post('/:id/detect-columns', detectDocumentColumns);
router.get('/:id/columns', getDocumentColumns);
router.get('/:id/export/csv', exportDocumentCsv);

export default router;
