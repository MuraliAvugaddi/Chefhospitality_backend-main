const express = require('express');
const router = express.Router();
const adminController = require('../../Controllers/AdimeControllers/adimeController.js');

router.get('/users', adminController.getAllUsers);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/deactivate-all', adminController.deactivateAllUsers);
router.get('/all-payments', adminController.getAllPayments);

// ✅ Admin Report Route
router.get('/skip-report', adminController.getAdminSkipReport);

// ✅ NEW: Manual Offline Payment Route & Excel Export Route
router.post('/payments/manual', adminController.recordManualPayment);
router.get('/reports/export-excel', adminController.exportStudentReportExcel);

module.exports = router;