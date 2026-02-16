// ✨ SOLUTION: Make sure these import lines are at the top of your file!
const User = require('../../Models/users');
const Token = require('../../Models/tokenModel'); // <-- This was the missing line


// GET USER-SPECIFIC HISTORY
exports.getUserTokenHistory = async (req, res) => {
    try {
        const userId = req.user.id; // From Auth Middleware
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const history = await Token.find({ userId })
            .sort({ generatedAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit);

        const totalCount = await Token.countDocuments({ userId });

        res.status(200).json({
            success: true,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            history
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching history" });
    }
};



// Function to get paginated token generation history
exports.getTokenHistory = async (req, res) => {
  try {
    // 1. Extract query parameters with defaults
    // ✅ Added 'date' to destructured parameters
    const { page = 1, limit = 20, mealType, date } = req.query; 
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 2. Build the matching query for filters
    const matchQuery = {};
    
    // Filter by Meal Type (Breakfast, Lunch, etc.)
    if (mealType && mealType !== 'All') {
      matchQuery.mealType = mealType;
    }
    
    // ✅ NEW: Filter by specific date string (e.g., "2026-02-15")
    if (date) {
      matchQuery.date = date; 
    }

    // 3. Build the aggregation pipeline
    const pipeline = [];

    // Always start with $match for performance if filters exist
    if (Object.keys(matchQuery).length > 0) {
      pipeline.push({ $match: matchQuery });
    }

    pipeline.push(
      { $sort: { generatedAt: -1 } }, // Newest logs first
      { $skip: skip },               // Pagination skip
      { $limit: parseInt(limit) },   // Pagination limit
      {
        $lookup: {
          from: 'users',             // Collection name in MongoDB
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      { $unwind: '$userDetails' },   // Flatten user array
      {
        $project: {
          _id: 0,
          tokenNumber: 1,
          mealType: 1,
          date: 1,
          generatedAt: 1,
          name: '$userDetails.name',
          enrollmentNo: '$userDetails.enrollmentNo',
          year: '$userDetails.year',
          room: '$userDetails.room',
        },
      }
    );

    // 4. Execute database operations
    const [history, totalCount] = await Promise.all([
      Token.aggregate(pipeline),
      Token.countDocuments(matchQuery) // Correct count for filtered pagination
    ]);

    // 5. Send standardized response
    res.status(200).json({
      success: true,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page),
      history: history,
    });
    
  } catch (error) {
    console.error('Error fetching token history:', error); 
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching token history.' 
    });
  }
};