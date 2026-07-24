// ✅ FORCE LOAD ENVIRONMENT VARIABLES FIRST
require('dotenv').config();

const User = require("../../Models/users");
const OTP = require("../../Models/otpModel"); 
const Payment = require("../../Models/paymentModel"); 
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// 1. Switch from Nodemailer to Resend
const { Resend } = require('resend');

// Make sure to add RESEND_API_KEY to your .env file!
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ SCALABLE PRODUCTION EMAIL LOGIC (Uses your verified domain)
const sendOtpEmail = async (email, otp) => {
    try {
        await resend.emails.send({
            // ✅ UPDATED: Using your verified custom domain
            from: 'Chef Mess App <otp@letsspeakglobal.com>',
            to: email,
            subject: `${otp} is your verification code for Chef Mess App`, 
            text: `Hello! Thank you for starting your registration for Chef Hospitality Services. Your 6-digit verification OTP is: ${otp}. This code is valid for 10 minutes. Please do not share this code with anyone.`, 
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                    <h2 style="color: #FFC800; text-align: center;">Chef Hospitality Services</h2>
                    <p>Thank you for registering with Chef Hospitality. Please use the one-time verification code below to complete registration Step 1:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background: #FFF9E6; padding: 10px 20px; border: 1px solid #FFE480; border-radius: 5px;">
                            ${otp}
                        </span>
                    </div>
                    <p style="color: #777; font-size: 12px; text-align: center;">This code is valid for 10 minutes. If you didn't request this code, you can safely ignore this email.</p>
                </div>
            `
        });
        console.log(`✨ Registration OTP email successfully dispatched to ${email}`);
    } catch (error) {
        console.error("❌ High-traffic mailer failed:", error);
        throw new Error("Failed to deliver verification code.");
    }
};

// 1. SIGNUP STEP 1
const siginuppage1 = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "An account with this email already exists." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.deleteMany({ email });
        await OTP.create({ email, otp });

        await sendOtpEmail(email, otp);
        res.status(200).json({ message: "OTP sent successfully to your email." });
    } catch (error) {
        console.error("Signup Step 1 error:", error);
        res.status(500).json({ message: "Server error during email validation or OTP delivery" });
    }
};

// VERIFY THE CODE ENTERED BY USER
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

        const otpRecord = await OTP.findOne({ email });
        if (!otpRecord) return res.status(400).json({ message: "OTP expired or was never requested." });
        if (otpRecord.otp !== otp) return res.status(400).json({ message: "Incorrect verification code." });

        await OTP.deleteOne({ email });
        res.status(200).json({ message: "Email verification successful." });
    } catch (error) {
        res.status(500).json({ message: "Server error during validation." });
    }
};

// 2. SIGNUP STEP 2
// 2. SIGNUP STEP 2
const siginuppage2 = async (req, res) => {
    try {
        const { name, email, password, enrollmentNo, course, year, phonenumber, hostelblock, room, gender } = req.body;
        
        // Validate that all required text fields and options are present
        if (!name || !email || !password || !enrollmentNo || !course || !year || !phonenumber || !hostelblock || !room || !gender) {
            return res.status(400).json({ message: "All text fields and gender selection are required." });
        }

        // ✅ Updated backend validation for enrollment length
        if (enrollmentNo.trim().length < 7) {
            return res.status(400).json({ message: "Enrollment number must be at least 7 characters long." });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { enrollmentNo }] });
        if (existingUser) return res.status(400).json({ message: "Email or Enrollment number already registered." });

        const newUser = new User({ name, email, password, enrollmentNo, course, year, phonenumber, hostelblock, room, gender });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "24h" });
        res.status(201).json({ message: "Registration successful!", token, user: newUser });
    } catch (error) {
        console.error("Signup Step 2 error:", error);
        res.status(500).json({ message: "Server error while creating account." });
    }
};

// 3. SIGNIN
const signinUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExsisting = await User.findOne({ email });
        if (!userExsisting) return res.status(400).json({ message: "User with this email does not exist!" });

        const isMatch = await bcrypt.compare(password, userExsisting.password);
        if (!isMatch) return res.status(400).json({ message: "Incorrect password" });
        
        const token = jwt.sign({ id: userExsisting._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ token, user: userExsisting.toObject() });
    } catch (e) {
        res.status(500).json({ message: "Server error" });
    }
};

// 4. FORGOT PASSWORD - SENDS RESET OTP VIA RESEND
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No account found with this email." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.deleteMany({ email });
        await OTP.create({ email, otp });

        // ✅ UPDATED: Using your verified custom domain
        await resend.emails.send({
            from: 'Chef Mess App <otp@letsspeakglobal.com>',
            to: email,
            subject: `${otp} is your password reset code`,
            text: `Use the confirmation code to reset your password: ${otp}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                    <h2 style="color: #FFC800; text-align: center;">Password Reset Request</h2>
                    <p>Use the confirmation code below to reset your password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background: #FFF9E6; padding: 10px 20px; border: 1px solid #FFE480; border-radius: 5px;">
                            ${otp}
                        </span>
                    </div>
                </div>
            `
        });

        res.status(200).json({ message: "Password reset OTP sent to your email." });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Server error while processing request." });
    }
};

// 5. RESET PASSWORD - UPDATES PASSWORD IN DB WITH DIAGNOSTIC LOGGING
const resetPassword = async (req, res) => {
    try {
        // ✅ DIAGNOSTIC LOGS: Instantly prints key parameters to your Node server terminal
        console.log("------------------------------------");
        console.log("📥 RECEIVED RESET PASSWORD REQUEST:");
        console.log("👉 email:", req.body.email);
        console.log("👉 otp:", req.body.otp);
        console.log("👉 newPassword:", req.body.newPassword);
        console.log("------------------------------------");

        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required." });
        }

        const otpRecord = await OTP.findOne({ email });
        if (!otpRecord || otpRecord.otp !== otp) return res.status(400).json({ message: "Invalid or expired reset code." });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found." });

        // Schema pre-save middleware encrypts this securely before storage
        user.password = newPassword;
        await user.save();
        await OTP.deleteOne({ email });

        res.status(200).json({ message: "Password updated successfully!" });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Server error during password update." });
    }
};

const getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user.id; 
        const payments = await Payment.find({ userId }).sort({ paidAt: -1 });
        res.status(200).json({ success: true, history: payments });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const handleOnlinePaymentSuccess = async (req, res) => {
    try {
        const userId = req.user.id;
        const { paymentId } = req.body;
        if (!paymentId) return res.status(400).json({ message: "Payment ID missing." });

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const updatedUser = await User.findByIdAndUpdate(userId, { isApproved: true, accessExpiresAt: lastDayOfMonth }, { new: true }).select('-password');
        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: "Server error during payment verification." });
    }
};

module.exports = { 
    siginuppage1, 
    verifyOTP, 
    siginuppage2, 
    signinUser, 
    forgotPassword,
    resetPassword,
    getPaymentHistory, 
    handleOnlinePaymentSuccess 
};