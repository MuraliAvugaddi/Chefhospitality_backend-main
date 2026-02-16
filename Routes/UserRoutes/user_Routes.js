const express = require('express');
const router = express.Router();

// ✅ CHANGE THIS LINE
const { auth } = require('../../Middelware/auth');

const getuserprofileController = require('../../Controllers/UserControllers/userController');

router.get('/profile', auth, getuserprofileController.getUserProfile);

module.exports = router;