const User = require("../../Models/users");
const Payment = require("../../Models/paymentModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// 1. SIGNUP STEP 1: Email availability check
const siginuppage1 = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "An account with this email already exists." });
        }
        res.status(200).json({ message: "Email is available. Please proceed." });
    } catch (error) {
        res.status(500).json({ message: "Server error during validation" });
    }
};

// 2. SIGNUP STEP 2: Save User to DB
const siginuppage2 = async (req, res) => {
    try {
        const { 
            name, email, password, enrollmentNo, 
            course, year, phonenumber, hostelblock, room, gender 
        } = req.body;

        if (!name || !email || !password || !enrollmentNo) {
            return res.status(400).json({ message: "Missing required registration details." });
        }

        const existingUser = await User.findOne({ 
            $or: [{ email }, { enrollmentNo }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                message: "Email or Enrollment number already registered." 
            });
        }

        const newUser = new User({ 
            name, email, password, enrollmentNo, course, 
            year, phonenumber, hostelblock, room, gender 
        });

        await newUser.save();

        // ✅ INCREASED: Changed from '24h' to '90d'
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "90d" });

        res.status(201).json({
            message: "Registration successful!",
            token,
            user: newUser
        });
    } catch (error) {
        console.error("Error in final signup:", error);
        res.status(500).json({ message: "Server error while creating account." });
    }
};

// 3. SIGNIN: Standardized Response
const signinUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExsisting = await User.findOne({ email });

        if (!userExsisting) {
            return res.status(400).json({ message: "User with this email does not exist!" });
        }

        const isMatch = await bcrypt.compare(password, userExsisting.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect password" });
        }
        
        // ✅ INCREASED: Changed from '24h' to '90d'
        const token = jwt.sign({ id: userExsisting._id }, process.env.JWT_SECRET, { expiresIn: '90d' });

        res.status(200).json({ token, user: userExsisting.toObject() });

    } catch (e) {
        console.log("There is an error", e);
        res.status(500).json({ message: "Server error" });
    }
};

// 4. GET PERSONAL PAYMENT HISTORY
const getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user.id; 
        const payments = await Payment.find({ userId }).sort({ paidAt: -1 });
        res.status(200).json({
            success: true,
            history: payments
        });
    } catch (error) {
        console.error("Error fetching user payment history:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 5. ONLINE PAYMENT SUCCESS HANDLER
const handleOnlinePaymentSuccess = async (req, res) => {
    try {
        const userId = req.user.id;
        const { paymentId } = req.body;

        if (!paymentId) {
            return res.status(400).json({ message: "Payment ID missing from Razorpay." });
        }

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { 
                isApproved: true, 
                accessExpiresAt: lastDayOfMonth 
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ 
            success: true, 
            message: "Online payment verified. Access granted until month end.", 
            user: updatedUser 
        });
    } catch (error) {
        console.error("Payment Verification Error:", error);
        res.status(500).json({ message: "Server error during payment verification." });
    }
};

module.exports = { 
    siginuppage1, 
    siginuppage2, 
    signinUser, 
    getPaymentHistory, 
    handleOnlinePaymentSuccess 
};