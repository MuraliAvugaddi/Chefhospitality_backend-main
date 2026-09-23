const ExcelJS = require('exceljs');
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

// 2. Approve/Deactivate User with Monthly Expiry & Payment Logging & Real-Time Socket Broadcast
const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isApproved } = req.body;
        const io = req.io; // Grab socket.io instance from request

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { isApproved, accessExpiresAt: isApproved ? lastDayOfMonth : null }, 
            { new: true }
        ).select('-password');

        // 🚀 BROADCAST REAL-TIME UPDATE TO STUDENT APP
        if (io) {
            io.emit('statusUpdated', {
                userId: updatedUser._id.toString(),
                isApproved: updatedUser.isApproved,
                accessExpiresAt: updatedUser.accessExpiresAt
            });
        }

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: 'Error updating user status' });
    }
};

// 3. Fetch Global Monthly Payment History & Check Backlog History
const getAllPayments = async (req, res) => {
    try {
        let { month, gender, date, userId } = req.query;

        if (userId) {
            const userPayments = await Payment.find({ userId }).lean();
            return res.status(200).json({ success: true, payments: userPayments });
        }

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
            query.paidAt = { $gte: startDate,$lte: endDate };
        } else if (month && month !== 'All Year') {
            query.month = month;
        }

        let payments = await Payment.find(query)
            .populate('userId', 'name enrollmentNo gender year room phonenumber course')
            .sort({ paidAt: -1 });

        if (gender && gender !== 'All') {
            payments = payments.filter(p => p.userId && p.userId.gender === gender);
        }

        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Failed to sync payment records" });
    }
};

const getDayScholarRevenue = async (req, res) => {
    try {
        const { month, mealType } = req.query;
        let query = { month };
        if (mealType && mealType !== 'All') query.mealType = mealType;

        const orders = await DayScholarOrder.find(query)
            .populate('userId', 'name enrollmentNo year room phonenumber course')
            .sort({ orderedAt: -1 });

        res.status(200).json(orders);
    } catch (e) {
        res.status(500).json({ message: "Error fetching records" });
    }
};

// 4. Deactivate All Users
const deactivateAllUsers = async (req, res) => {
    try {
        const { io } = req;
        await User.updateMany({}, { $set: { isApproved: false, accessExpiresAt: null } });
        if (io) io.emit('statusUpdated', { isApproved: false, accessExpiresAt: null });

        res.status(200).json({ success: true, message: 'All users deactivated for new month.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error deactivating users.' });
    }
};

// 5. Fetch Meal Skipping Report
const getAdminSkipReport = async (req, res) => {
    try {
        const { date, mealType } = req.query; 
        let query = { date: date };

        if (mealType && mealType !== 'All') {
            query.mealType = mealType;
        }

        const report = await MealSkip.find(query)
            .populate('userId', 'name phonenumber gender room enrollmentNo course') 
            .sort({ mealType: 1 });

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
            stats: stats,
            report: report
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching report" });
    }
};

// 6. Manually Record Offline/Cash Payment & Real-Time Socket Broadcast
const recordManualPayment = async (req, res) => {
    try {
        const { userId, amount, month, transactionId, paymentDate } = req.body;
        const io = req.io; // Grab socket.io instance from request

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "Student not found." });

        const now = new Date();
        const payment = await Payment.create({
            userId,
            amount: amount || 4000,
            method: 'offline',
            transactionId: transactionId || `CASH_${Date.now()}`,
            month: month || "September 2026",
            status: 'Success',
            paidAt: paymentDate ? new Date(paymentDate) : now
        });

        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        user.isApproved = true;
        user.accessExpiresAt = lastDayOfMonth;
        await user.save();

        // 🚀 BROADCAST REAL-TIME UPDATE TO STUDENT APP
        if (io) {
            io.emit('statusUpdated', {
                userId: user._id.toString(),
                isApproved: user.isApproved,
                accessExpiresAt: user.accessExpiresAt
            });
        }

        res.status(200).json({ success: true, message: "Offline payment recorded & access granted.", payment });
    } catch (error) {
        console.error("Manual payment error:", error);
        res.status(500).json({ message: "Server error recording payment." });
    }
};

// 7. Export Filtered Student Payment Status to Excel (Includes Paid & Unpaid Students, A-Z Sorted)
const exportStudentReportExcel = async (req, res) => {
    try {
        const { yearGroup, gender, month } = req.query; 
        
        let userQuery = {};
        if (gender && gender !== 'All') {
            userQuery.gender = gender;
        }
        
        if (yearGroup === 'Junior') {
            userQuery.year = 1;
        } else if (yearGroup === 'Senior') {
            userQuery.year = { $gte: 2 };
        }

        // Fetch all matching users sorted alphabetically from A to Z
        const users = await User.find(userQuery).select('-password').sort({ name: 1 }).lean();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Student Mess Report');

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        if (month === 'All Year') {
            // Yearly Printout Layout
            sheet.columns = [
                { header: 'S.No', key: 'sno', width: 8 },
                { header: 'Student Name', key: 'name', width: 25 },
                { header: 'Course', key: 'course', width: 15 },
                { header: 'Phone Number', key: 'phonenumber', width: 16 },
                { header: 'Aug Payment', key: 'augPay', width: 15 },
                { header: 'Sep Payment', key: 'sepPay', width: 15 },
                { header: 'Total Paid Months', key: 'totalPaid', width: 18 },
            ];

            const payments = await Payment.find({}).lean();
            const userPaymentsMap = {};
            payments.forEach(p => {
                if (p.userId) {
                    const uid = p.userId.toString();
                    if (!userPaymentsMap[uid]) userPaymentsMap[uid] = [];
                    userPaymentsMap[uid].push(p);
                }
            });

            users.forEach((u, index) => {
                const userPays = userPaymentsMap[u._id.toString()] || [];
                const augPayRecord = userPays.find(p => p.month?.includes('August'));
                const sepPayRecord = userPays.find(p => p.month?.includes('September'));

                sheet.addRow({
                    sno: index + 1,
                    name: u.name,
                    course: u.course || 'N/A',
                    phonenumber: u.phonenumber || 'N/A',
                    augPay: augPayRecord ? `${augPayRecord.amount}` : 'UNPAID',
                    sepPay: sepPayRecord ? `${sepPayRecord.amount}` : 'UNPAID',
                    totalPaid: `${userPays.length} Months`,
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Chef_Yearly_Mess_Report_${yearGroup || 'All'}.xlsx`);
        } else {
            // Monthly Printout Layout
            const targetMonth = month || 'September 2026';
            const payments = await Payment.find({ month: targetMonth }).lean();
            const paymentMap = {};
            payments.forEach(p => {
                if (p.userId) {
                    paymentMap[p.userId.toString()] = p;
                }
            });

            sheet.columns = [
                { header: 'S.No', key: 'sno', width: 8 },
                { header: 'Student Name', key: 'name', width: 25 },
                { header: 'Course', key: 'course', width: 15 },
                { header: 'Phone Number', key: 'phonenumber', width: 16 },
                { header: 'Sep Payment', key: 'sepPayment', width: 18 },
                { header: 'UTR / Txn ID', key: 'txnId', width: 25 },
                { header: 'Payment Date', key: 'paidAt', width: 18 },
            ];

            users.forEach((u, index) => {
                const pay = paymentMap[u._id.toString()];
                
                let formattedDate = '-';
                if (pay && pay.paidAt) {
                    const d = new Date(pay.paidAt);
                    const day = String(d.getDate()).padStart(2, '0');
                    const monthStr = monthNames[d.getMonth()].slice(0, 3);
                    const year = d.getFullYear();
                    formattedDate = `${day}-${monthStr}-${year}`;
                }

                sheet.addRow({
                    sno: index + 1,
                    name: u.name,
                    course: u.course || 'N/A',
                    phonenumber: u.phonenumber || 'N/A',
                    sepPayment: pay ? `${pay.amount}` : 'UNPAID',
                    txnId: pay ? (pay.transactionId || 'Cash') : '-',
                    paidAt: formattedDate,
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Chef_Mess_Report_${yearGroup || 'All'}_${targetMonth}.xlsx`);
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Excel export error:", error);
        res.status(500).json({ message: "Failed to generate Excel report" });
    }
};

module.exports = {
    getAllUsers,
    updateUserStatus,
    getAllPayments,
    getDayScholarRevenue,
    deactivateAllUsers,
    getAdminSkipReport,
    recordManualPayment,
    exportStudentReportExcel,
};