const express = require('express');
const router = express.Router();
const adminController = require('../../Controllers/AdimeControllers/adimeController.js');

// 1. Fetch Users
router.get('/users', adminController.getAllUsers);

// 2. Status Updates (Supports both PATCH and PUT for older/newer clients)
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId', adminController.updateUserStatus);
router.put('/users/:userId', adminController.updateUserStatus);

// 3. Deactivate All Users
router.patch('/users/deactivate-all', adminController.deactivateAllUsers);
router.post('/users/deactivate-all', adminController.deactivateAllUsers);

// 4. Payments & Reports
router.get('/all-payments', adminController.getAllPayments);
router.get('/skip-report', adminController.getAdminSkipReport);

// 5. Manual Offline Payment & Excel Export
router.post('/payments/manual', adminController.recordManualPayment);
router.put('/payments/manual', adminController.recordManualPayment);
router.get('/reports/export-excel', adminController.exportStudentReportExcel);

module.exports = router;