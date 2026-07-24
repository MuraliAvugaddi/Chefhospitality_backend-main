const Token = require('../../Models/tokenModel');
// ✅ SCALABILITY FIX: Import the Counter model for atomic operations.
const Counter = require('../../Models/counterModels');

/**
 * HELPER: Atomic Token Number Generator
 * Uses a dedicated counter document to prevent duplicate token numbers
 * during high-concurrency requests.
 */
const getNextTokenNumber = async (mealType, date) => {
    // Each meal on each day gets its own unique counter document (e.g., "breakfast_2026-02-10")
    const sequenceName = `${mealType.toLowerCase()}_${date}`;
    
    // findByIdAndUpdate is "atomic" - it locks the row while updating to prevent race conditions.
    const counter = await Counter.findByIdAndUpdate(
        sequenceName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true } // Creates the counter if it doesn't exist yet
    );
    return counter.seq;
};

// 1. GENERATE TOKEN
exports.generateToken = async (req, res) => {
  try {
    const { mealType } = req.body;
    const userId = req.user.id;

    // Time validation logic
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTimeInMinutes = hour * 60 + minute;

    let isValidTime = false;
    switch (mealType) {
        // Validation windows (adjust these values for production)
        case "Breakfast": isValidTime = currentTimeInMinutes >= 470 && currentTimeInMinutes <= 1290; break;
        case "Lunch":     isValidTime = currentTimeInMinutes >= 470 && currentTimeInMinutes <= 1290; break;
        case "Snacks":    isValidTime = currentTimeInMinutes >= 470 && currentTimeInMinutes <= 1290; break;
        case "Dinner":    isValidTime = currentTimeInMinutes >= 470 && currentTimeInMinutes <= 1290; break;
    }

    if (!isValidTime) {
      return res.status(403).json({ success: false, message: `The window for ${mealType} is closed.` });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Prevent duplicate tokens for the same user/meal/day
    const existingToken = await Token.findOne({ userId, mealType, date: today });
    if (existingToken) {
        return res.status(409).json({ success: false, message: `You have already generated a ${mealType} token today.` });
    }
    
    // Get the next sequential number atomically
    const tokenNumber = await getNextTokenNumber(mealType, today);

    const newToken = new Token({ userId, mealType, tokenNumber, date: today });
    await newToken.save();
    
    res.status(201).json({ success: true, token: newToken });

  } catch (error) {
    // Handle MongoDB unique constraint errors
    if (error.code === 11000) {
        return res.status(409).json({ success: false, message: `Duplicate token detected.` });
    }
    console.error("Token Generation Error:", error);
    res.status(500).json({ success: false, message: 'Server error while generating token.' });
  }
};

// 2. GET USER-SPECIFIC HISTORY (With Pagination)
// 2. GET USER-SPECIFIC HISTORY (With Pagination & Optional Month Filter)
exports.getUserTokenHistory = async (req, res) => {
    try {
        const userId = req.user.id; 
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        const monthQuery = req.query.month; // Format: "YYYY-MM"

        let query = { userId };
        
        // If a month is specified, filter by date prefix (e.g., "2026-06")
        if (monthQuery) {
            query.date = { $regex: `^${monthQuery}` };
        }

        const history = await Token.find(query)
            .sort({ generatedAt: -1 }) 
            .skip(skip)
            .limit(limit);

        const totalCount = await Token.countDocuments(query);

        res.status(200).json({
            success: true,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            history
        });
    } catch (error) {
        console.error("History Fetch Error:", error);
        res.status(500).json({ success: false, message: "Error fetching history" });
    }
};
// 3. ADMIN: GET STATS BY DATE
exports.getStatsByDate = async (req, res) => {
    try {
        // Allows admin to query specific dates like ?date=2026-02-10
        const date = req.query.date || new Date().toISOString().slice(0, 10);

        const stats = await Token.aggregate([
            { $match: { date: date } },
            { $group: { _id: '$mealType', count: { $sum: 1 } } }
        ]);

        // Default structure to ensure all meals are represented even if count is 0
        const formattedStats = { "Breakfast": 0, "Lunch": 0, "Snacks": 0, "Dinner": 0 };
        
        stats.forEach(item => {
            if (item._id && formattedStats.hasOwnProperty(item._id)) {
                formattedStats[item._id] = item.count;
            }
        });
        
        res.status(200).json(formattedStats);
    } catch (error) {
        console.error("Stats Fetch Error:", error);
        res.status(500).json({ success: false, message: 'Server error while fetching stats.' });
    }


};