const express = require('express'); 
const router = express.Router();

// Import the specific functions from your middleware file
const { auth } = require("../../Middelware/auth");
const authcontroller = require('../../Controllers/UserControllers/authControllers');

// Step 1: Validates email availability (No user created yet)
router.post("/signup/1", authcontroller.siginuppage1);

// ✅ FIX: Remove 'auth' from this route. 
// This route now receives ALL data and creates the user for the first time.
router.post("/signup/2", authcontroller.siginuppage2); 

// Standard Signin
router.post("/signin", authcontroller.signinUser);

// This still needs auth because the user must be logged in to verify a payment
router.post("/payment-success", auth, authcontroller.handleOnlinePaymentSuccess);

module.exports = router;