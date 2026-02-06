import { Router } from 'express';
import mastersRouter from './masters';
import purchaseRouter from './purchase';
import productionRouter from './production';
import salesRouter from './sales';
import accountsRouter from './accounts';
import inventoryRouter from './inventory';
import reportsRouter from './reports';
import dashboardRouter from './dashboard';
import bellInventoryRouter from './bell-inventory';

import financeRouter from './finance';

const router = Router();

router.use('/masters', mastersRouter);
router.use('/purchase', purchaseRouter);
router.use('/production', productionRouter);
router.use('/sales', salesRouter);
router.use('/accounts', accountsRouter);
router.use('/inventory', inventoryRouter);
router.use('/bell-inventory', bellInventoryRouter);
router.use('/reports', reportsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/finance', financeRouter);

export default router;
