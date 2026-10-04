const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const User = require('../../Models/users');
const Payment = require('../../Models/paymentModel');
const MealSkip = require('../../Models/mealSkipModel');

// Helper to safely find user by ID
const findUserSafely = async (rawId) => {
    if (!rawId) return null;
    const cleanId = String(rawId).trim();
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
        const found = await User.findById(cleanId);
        if (found) return found;
    }
    return await User.findOne({
        $or: [{ _id: cleanId }, { id: cleanId }]
    });
};

// 1. Fetch all users for admin dashboard (Auto-evaluates expired access)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
        const now = new Date();

        const formattedUsers = users.map((u) => {
            const stringId = u._id ? u._id.toString() : (u.id ? u.id.toString() : '');

            // Automatically evaluate if their monthly access has expired
            let isCurrentlyApproved = Boolean(u.isApproved);
            if (u.accessExpiresAt && new Date(u.accessExpiresAt) < now) {
                isCurrentlyApproved = false;
            }

            return {
                ...u,
                _id: stringId,
                id: stringId,
                name: u.name || 'Unnamed Student',
                enrollmentNo: u.enrollmentNo ? String(u.enrollmentNo) : 'N/A',
                phonenumber: u.phonenumber ? String(u.phonenumber) : '',
                course: u.course || 'N/A',
                year: u.year ? String(u.year) : '1',
                room: u.room ? String(u.room) : 'N/A',
                gender: u.gender || 'All',
                fatherPhone: u.fatherPhone ? String(u.fatherPhone) : '',
                isApproved: isCurrentlyApproved, // Returns false automatically if past accessExpiresAt
                accessExpiresAt: u.accessExpiresAt || null,
            };
        });

        res.status(200).json(formattedUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: 'Server error while fetching users.' });
    }
};

// 2. Approve/Deactivate User
const updateUserStatus = async (req, res) => {
    try {
        const rawUserId = req.params.userId || req.body.userId;
        const { isApproved } = req.body;
        const io = req.io;

        if (!rawUserId || rawUserId === 'undefined' || rawUserId === 'null' || rawUserId === 'N/A') {
            return res.status(400).json({ message: 'Valid Student User ID is required.' });
        }

        const cleanUserId = String(rawUserId).trim();
        const boolApproved = (isApproved === true || isApproved === 'true' || isApproved === 1);

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const filter = mongoose.Types.ObjectId.isValid(cleanUserId)
            ? { _id: new mongoose.Types.ObjectId(cleanUserId) }
            : { $or: [{ _id: cleanUserId }, { id: cleanUserId }] };

        const updatedUser = await User.findOneAndUpdate(
            filter,
            {
                $set: {
                    isApproved: boolApproved,
                    accessExpiresAt: boolApproved ? lastDayOfMonth : null
                }
            },
            { new: true, runValidators: false }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'Student account not found in database.' });
        }

        const idStr = updatedUser._id.toString();

        if (io) {
            io.emit('statusUpdated', {
                userId: idStr,
                isApproved: updatedUser.isApproved,
                accessExpiresAt: updatedUser.accessExpiresAt
            });
        }

        res.status(200).json({
            success: true,
            user: {
                ...updatedUser.toObject(),
                _id: idStr,
                id: idStr
            }
        });
    } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: 'Error updating user status', error: error.message });
    }
};

// 3. Fast Global Monthly Payment History
const getAllPayments = async (req, res) => {
    try {
        let { month, gender, date, userId } = req.query;

        if (userId) {
            const cleanUid = String(userId).trim();
            const userFilters = [{ userId: cleanUid }];
            if (mongoose.Types.ObjectId.isValid(cleanUid)) {
                userFilters.push({ userId: new mongoose.Types.ObjectId(cleanUid) });
            }

            const userPayments = await Payment.find({ $or: userFilters })
                .select('userId amount method transactionId month status paidAt')
                .sort({ updatedAt: -1, paidAt: -1 })
                .lean();

            return res.status(200).json({ success: true, payments: userPayments });
        }

        let query = {};
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.paidAt = { $gte: startDate,$lte: endDate };
        } else if (month && month !== 'All Year' && month !== 'All') {
            query.month = { $regex: new RegExp(`^${month.trim()}$`, 'i') };
        }

        const payments = await Payment.find(query)
            .select('userId amount method transactionId month status paidAt')
            .lean();

        res.status(200).json(payments);
    } catch (error) {
        console.error("Sync payment error:", error);
        res.status(500).json({ message: "Failed to sync payment records" });
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
            .populate('userId', 'name phonenumber fatherPhone gender room enrollmentNo course')
            .sort({ mealType: 1 })
            .lean();

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

// 6. Record Manual Payment (WITH STRICT DUPLICATE UTR PROTECTION)
const recordManualPayment = async (req, res) => {
    try {
        const { userId, amount, month, paymentsData, transactionId, paymentDate, fatherPhone } = req.body;
        const io = req.io;

        if (!userId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        const user = await findUserSafely(userId);
        if (!user) {
            return res.status(404).json({ message: "Student account not found in database." });
        }

        if (fatherPhone && String(fatherPhone).trim() !== '') {
            user.fatherPhone = String(fatherPhone).trim();
        }

        const parsedPaymentDate = paymentDate ? new Date(paymentDate) : new Date();
        const parsedAmount = Number(amount);
        const finalAmount = (!isNaN(parsedAmount) && parsedAmount > 0) ? parsedAmount : 4000;

        let recordsToProcess = [];
        if (paymentsData && Array.isArray(paymentsData) && paymentsData.length > 0) {
            recordsToProcess = paymentsData;
        } else {
            recordsToProcess = [{
                month: month || "October 2026",
                transactionId: transactionId || `CASH_${Date.now()}`
            }];
        }

        // =========================================================================
        // 🔒 DUPLICATE UTR VALIDATION (CHECKS ALL STUDENTS & MONTHS)
        // =========================================================================
        for (const item of recordsToProcess) {
            const rawTxn = item.transactionId ? String(item.transactionId).trim() : '';
            const isCashOrDummy = rawTxn.toUpperCase().startsWith('CASH') || rawTxn.toUpperCase() === 'N/A';

            if (rawTxn && !isCashOrDummy) {
                // Find if this UTR has already been registered in the system
                const existingTxn = await Payment.findOne({
                    transactionId: { $regex: new RegExp(`^${rawTxn}$`, 'i') },
                    status: 'Success'
                }).populate('userId', 'name phonenumber enrollmentNo').lean();

                if (existingTxn) {
                    const existingUid = existingTxn.userId ? String(existingTxn.userId._id || existingTxn.userId.id || existingTxn.userId) : '';
                    const currentUid = String(user._id);

                    const isDifferentStudent = existingUid && existingUid !== currentUid;
                    const isDifferentMonth = existingTxn.month && !existingTxn.month.toLowerCase().includes((item.month || '').toLowerCase().split(' ')[0]);

                    if (isDifferentStudent || isDifferentMonth) {
                        const previousStudentName = existingTxn.userId?.name || "Another Student";
                        const previousMonth = existingTxn.month || "a past month";
                        return res.status(400).json({
                            success: false,
                            message: `Duplicate UTR detected! Transaction ID (${rawTxn}) was already recorded for ${previousStudentName} (${previousMonth}). Reusing screenshots is strictly prohibited.`
                        });
                    }
                }
            }
        }

        // =========================================================================
        // SAVE OR UPDATE PAYMENT
        // =========================================================================
        for (const item of recordsToProcess) {
            const targetMonth = String(item.month || '').trim();
            if (!targetMonth) continue;

            const txnId = item.transactionId ? String(item.transactionId).trim() : `CASH_${Date.now()}`;
            const monthPrefix = targetMonth.split(' ')[0];

            const userMatchFilter = {
                $or: [
                    { userId: user._id },
                    { userId: user._id.toString() }
                ],
                month: { $regex: new RegExp(monthPrefix, 'i') }
            };

            await Payment.findOneAndUpdate(
                userMatchFilter,
                {
                    $set: {
                        userId: user._id,
                        amount: finalAmount,
                        method: 'offline',
                        transactionId: txnId,
                        month: targetMonth,
                        status: 'Success',
                        paidAt: parsedPaymentDate,
                        updatedAt: new Date()
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const allMatches = await Payment.find(userMatchFilter).sort({ updatedAt: -1 });
            if (allMatches.length > 1) {
                const idsToDelete = allMatches.slice(1).map(d => d._id);
                await Payment.deleteMany({ _id: { $in: idsToDelete } });
            }
        }

        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        user.isApproved = true;
        user.accessExpiresAt = lastDayOfMonth;
        await user.save();

        if (io) {
            io.emit('statusUpdated', {
                userId: user._id.toString(),
                isApproved: user.isApproved,
                accessExpiresAt: user.accessExpiresAt
            });
        }

        res.status(200).json({
            success: true,
            message: "Payment records successfully saved/updated & access granted."
        });
    } catch (error) {
        console.error("Manual payment update error:", error);
        res.status(500).json({ message: "Server error recording payment.", error: error.message });
    }
};

// 7. Export Filtered Student Payment Status to Excel
const exportStudentReportExcel = async (req, res) => {
    try {
        const { yearGroup, gender, month, unpaidOnly } = req.query;
        const isUnpaidFilterActive = (unpaidOnly === 'true' || unpaidOnly === true || unpaidOnly === '1');

        let userQuery = {};
        if (gender && gender !== 'All') {
            userQuery.gender = { $regex: new RegExp(`^${gender.trim()}$`, 'i') };
        }

        if (yearGroup === 'Junior') {
            userQuery.$or = [{ year: '1' }, { year: 1 }];
        } else if (yearGroup === 'Senior') {
            userQuery.$or = [
                { year: { $ne: '1' } },                 { year: {$ne: 1 } }
            ];
        }

        const users = await User.find(userQuery).select('-password').sort({ name: 1 }).lean();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(isUnpaidFilterActive ? 'Unpaid Students' : 'Student Mess Report');

        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const allPayments = await Payment.find({ status: 'Success', amount: { $gt: 0 } }).lean();
        const userPaymentsMap = {};
        for (const p of allPayments) {
            if (p.userId) {
                const uid = p.userId.toString();
                if (!userPaymentsMap[uid]) userPaymentsMap[uid] = [];
                userPaymentsMap[uid].push(p);
            }
        }

        if (month === 'All Year') {
            sheet.columns = [
                { header: 'S.No', key: 'sno', width: 8 },
                { header: 'Student Name', key: 'name', width: 25 },
                { header: 'Gender', key: 'gender', width: 12 },
                { header: 'Year', key: 'year', width: 10 },
                { header: 'Room', key: 'room', width: 12 },
                { header: 'Course', key: 'course', width: 15 },
                { header: 'Phone Number', key: 'phonenumber', width: 16 },
                { header: 'Father Phone', key: 'fatherPhone', width: 16 },
                { header: 'Aug Payment', key: 'augPay', width: 20 },
                { header: 'Sep Payment', key: 'sepPay', width: 20 },
                { header: 'Oct Payment', key: 'octPay', width: 20 },
                { header: 'Status', key: 'status', width: 15 },
            ];

            let rowCount = 0;
            users.forEach((u) => {
                const uidStr = u._id ? u._id.toString() : '';
                const userPays = userPaymentsMap[uidStr] || [];
                const augPayRecord = userPays.find(p => p.month?.toLowerCase().includes('august'));
                const sepPayRecord = userPays.find(p => p.month?.toLowerCase().includes('september'));
                const octPayRecord = userPays.find(p => p.month?.toLowerCase().includes('october'));

                const isPaidAll = (augPayRecord && sepPayRecord && octPayRecord);

                if (isUnpaidFilterActive && isPaidAll) {
                    return;
                }

                rowCount++;
                sheet.addRow({
                    sno: rowCount,
                    name: u.name,
                    gender: u.gender || 'N/A',
                    year: u.year || '1',
                    room: u.room || 'N/A',
                    course: u.course || 'N/A',
                    phonenumber: u.phonenumber || 'N/A',
                    fatherPhone: (u.fatherPhone && u.fatherPhone.trim() !== '') ? u.fatherPhone : 'N/A',
                    augPay: augPayRecord ? `₹${augPayRecord.amount} [${augPayRecord.transactionId || 'Cash'}]` : 'UNPAID',
                    sepPay: sepPayRecord ? `₹${sepPayRecord.amount} [${sepPayRecord.transactionId || 'Cash'}]` : 'UNPAID',
                    octPay: octPayRecord ? `₹${octPayRecord.amount} [${octPayRecord.transactionId || 'Cash'}]` : 'UNPAID',
                    status: !octPayRecord ? 'UNPAID OCT' : 'PAID OCT',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Chef_${isUnpaidFilterActive ? 'UNPAID_' : ''}Yearly_Report_${yearGroup || 'All'}.xlsx`);
        } else {
            const targetMonth = month || 'October 2026';
            const targetMonthPrefix = targetMonth.split(' ')[0].toLowerCase();

            sheet.columns = [
                { header: 'S.No', key: 'sno', width: 8 },
                { header: 'Student Name', key: 'name', width: 25 },
                { header: 'Gender', key: 'gender', width: 12 },
                { header: 'Year', key: 'year', width: 10 },
                { header: 'Room', key: 'room', width: 12 },
                { header: 'Course', key: 'course', width: 15 },
                { header: 'Phone Number', key: 'phonenumber', width: 16 },
                { header: 'Father Phone', key: 'fatherPhone', width: 16 },
                { header: `${targetMonth} Status`, key: 'monthStatus', width: 18 },
                { header: 'Amount', key: 'amount', width: 14 },
                { header: 'UTR / Txn ID', key: 'txnId', width: 25 },
                { header: 'Payment Date', key: 'paidAt', width: 18 },
            ];

            let rowCount = 0;
            users.forEach((u) => {
                const uidStr = u._id ? u._id.toString() : '';
                const userPays = userPaymentsMap[uidStr] || [];
                const pay = userPays.find(p => p.month?.toLowerCase().includes(targetMonthPrefix));
                const isPaid = (pay !== undefined && pay !== null);

                if (isUnpaidFilterActive && isPaid) {
                    return;
                }

                let formattedDate = '-';
                if (pay && pay.paidAt) {
                    const d = new Date(pay.paidAt);
                    const day = String(d.getDate()).padStart(2, '0');
                    const monthStr = monthNames[d.getMonth()].slice(0, 3);
                    const year = d.getFullYear();
                    formattedDate = `${day}-${monthStr}-${year}`;
                }

                rowCount++;
                sheet.addRow({
                    sno: rowCount,
                    name: u.name,
                    gender: u.gender || 'N/A',
                    year: u.year || '1',
                    room: u.room || 'N/A',
                    course: u.course || 'N/A',
                    phonenumber: u.phonenumber || 'N/A',
                    fatherPhone: (u.fatherPhone && u.fatherPhone.trim() !== '') ? u.fatherPhone : 'N/A',
                    monthStatus: isPaid ? 'PAID' : 'UNPAID',
                    amount: isPaid ? `₹${pay.amount}` : '0',
                    txnId: isPaid ? (pay.transactionId || 'Cash') : '-',
                    paidAt: formattedDate,
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Chef_${isUnpaidFilterActive ? 'UNPAID_' : ''}Mess_Report_${yearGroup || 'All'}_${targetMonth.replace(/\s+/g, '_')}.xlsx`);
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
    deactivateAllUsers,
    getAdminSkipReport,
    recordManualPayment,
    exportStudentReportExcel,
};