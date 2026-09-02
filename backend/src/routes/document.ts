import { Router } from 'express';
import { parseDocument, getParseResult, getScreenshot } from '../controllers/parseController';
import { reconstructDocumentRows, getDocumentRows } from '../controllers/rowController';
import { detectDocumentTransactions, getDocumentTransactions, patchDocumentTransactions, reconcileDocumentTransactions } from '../controllers/transactionController';
import { detectDocumentColumns, getDocumentColumns } from '../controllers/columnController';
import { exportDocumentCsv } from '../controllers/exportController';
import { extractTransactions } from '../controllers/extractionController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// screenshot/export are hit as plain <img src>/<a href> (no Authorization header available there),
// so they stay unauthenticated for now — document ids are opaque uuids.
router.get('/:id/screenshot/:page', getScreenshot);
router.get('/:id/export/csv', exportDocumentCsv);

router.post('/:id/parse', requireAuth, parseDocument);
router.post('/:id/extract-transactions', requireAuth, extractTransactions);
router.get('/:id/parsed', requireAuth, getParseResult);
router.post('/:id/reconstruct-rows', requireAuth, reconstructDocumentRows);
router.get('/:id/rows', requireAuth, getDocumentRows);
router.post('/:id/detect-transactions', requireAuth, detectDocumentTransactions);
router.get('/:id/transactions', requireAuth, getDocumentTransactions);
router.patch('/:id/transactions', requireAuth, patchDocumentTransactions);
router.post('/:id/reconcile', requireAuth, reconcileDocumentTransactions);
router.post('/:id/detect-columns', requireAuth, detectDocumentColumns);
router.get('/:id/columns', requireAuth, getDocumentColumns);

export default router;
