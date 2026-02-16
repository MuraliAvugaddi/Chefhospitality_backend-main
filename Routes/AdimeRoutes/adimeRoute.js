const express = require('express');
const router = express.Router();
const adminController = require('../../Controllers/AdimeControllers/adimeController.js');

router.get('/users', adminController.getAllUsers);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/deactivate-all', adminController.deactivateAllUsers);
router.get('/all-payments', adminController.getAllPayments);

// ✅ NEW: Admin Report Route
router.get('/skip-report', adminController.getAdminSkipReport);

module.exports = router;