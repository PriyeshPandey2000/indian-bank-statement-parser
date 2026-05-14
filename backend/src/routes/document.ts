import { Router } from 'express';
import { parseDocument, getParseResult, getScreenshot } from '../controllers/parseController';
import { reconstructDocumentRows, getDocumentRows } from '../controllers/rowController';
import { detectDocumentTransactions, getDocumentTransactions } from '../controllers/transactionController';
import { detectDocumentColumns, getDocumentColumns } from '../controllers/columnController';
import { exportDocumentCsv } from '../controllers/exportController';

const router = Router();

router.post('/:id/parse', parseDocument);
router.get('/:id/parsed', getParseResult);
router.get('/:id/screenshot/:page', getScreenshot);
router.post('/:id/reconstruct-rows', reconstructDocumentRows);
router.get('/:id/rows', getDocumentRows);
router.post('/:id/detect-transactions', detectDocumentTransactions);
router.get('/:id/transactions', getDocumentTransactions);
router.post('/:id/detect-columns', detectDocumentColumns);
router.get('/:id/columns', getDocumentColumns);
router.get('/:id/export/csv', exportDocumentCsv);

export default router;
