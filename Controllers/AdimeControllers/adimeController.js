const User = require('../../Models/users');
const Payment = require('../../Models/paymentModel');
const MealSkip = require('../../Models/mealSkipModel');

// 1. Fetch all users for the admin dashboard
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching users.' });
    }
};

// 2. Approve/Deactivate User with Monthly Expiry & Payment Logging
// backend/Controllers/AdimeControllers/adimeController.js

const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isApproved } = req.body;
        const { io, userSockets } = req;

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { isApproved, accessExpiresAt: isApproved ? lastDayOfMonth : null }, 
            { new: true }
        ).select('-password');

        // ✅ EMIT TO SPECIFIC USER
        const socketId = userSockets[userId];
        if (socketId) {
            io.to(socketId).emit('statusUpdated', {
                isApproved: updatedUser.isApproved,
                accessExpiresAt: updatedUser.accessExpiresAt
            });
        }

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: 'Error' });
    }
};

// 3. Fetch Global Payment History with Gender Filtering
// Inside adimeController.js (or wherever verifyCashfreePayment resides)

// 3. Fetch Global Monthly Payment History (Excluding Day Scholar micro-orders)
const getAllPayments = async (req, res) => {
    try {
        let { month, gender, date } = req.query;

        if ((!month || month === 'All') && !date) {
            const now = new Date();
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            month = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        }

        let query = {};
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.paidAt = { $gte: startDate, $lte: endDate };
        } else if (month) {
            query.month = month;
        }

        // Only query standard subscription payments (e.g. ₹4000 or offline entries)
        let payments = await Payment.find(query)
            .populate('userId', 'name enrollmentNo gender year room phonenumber')
            .sort({ paidAt: -1 });

        if (gender && gender !== 'All') {
            payments = payments.filter(p => p.userId && p.userId.gender === gender);
        }

        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Failed to sync payment records" });
    }
};
// Backend endpoint update for Admin collection separation by meal type if required:
const getDayScholarRevenue = async (req, res) => {
    try {
        const { month, mealType } = req.query;
        let query = { month };
        if (mealType && mealType !== 'All') query.mealType = mealType;

        const orders = await DayScholarOrder.find(query)
            .populate('userId', 'name enrollmentNo year room phonenumber')
            .sort({ orderedAt: -1 });

        res.status(200).json(orders);
    } catch (e) {
        res.status(500).json({ message: "Error fetching records" });
    }
};

// 4. Deactivate All Users (Reset for the new month)
const deactivateAllUsers = async (req, res) => {
    try {
        const { io } = req;
        await User.updateMany({}, { $set: { isApproved: false, accessExpiresAt: null } });
        io.emit('statusUpdated', { isApproved: false, accessExpiresAt: null });

        res.status(200).json({ success: true, message: 'All users deactivated for new month.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error deactivating users.' });
    }
};

// 5. ✅ UPDATED: Fetch Meal Skipping Report with Categorized Totals
const getAdminSkipReport = async (req, res) => {
    try {
        const { date, mealType } = req.query; 
        let query = { date: date };

        if (mealType && mealType !== 'All') {
            query.mealType = mealType;
        }

        const report = await MealSkip.find(query)
            .populate('userId', 'name phonenumber gender room enrollmentNo') 
            .sort({ mealType: 1 });

        // ✅ NEW: Calculate Breakdown for the Admin Dashboard
        const stats = {
            breakfast: report.filter(item => item.mealType === 'Breakfast').length,
            lunch: report.filter(item => item.mealType === 'Lunch').length,
            snacks: report.filter(item => item.mealType === 'Snacks').length,
            dinner: report.filter(item => item.mealType === 'Dinner').length,
            fullDay: report.filter(item => item.mealType === 'Full Day').length,
            total: report.length
        };

        res.status(200).json({
            success: true,
            date: date,
            stats: stats, // Sending the breakdown to Flutter
            report: report
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching report" });
    }
};

module.exports = {
    getAllUsers,
    updateUserStatus,
    getAllPayments,
    deactivateAllUsers,
    getAdminSkipReport,
};