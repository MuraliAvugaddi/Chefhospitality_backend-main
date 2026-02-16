// Models/tokenModel.js
const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  mealType: {
    type: String,
    enum: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'],
    required: true,
  },
  tokenNumber: {
    type: Number,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    // ✅ Updated: Automatically deletes after 32 days (2,764,800 seconds)
    expires: 2764800,
  },
});

tokenSchema.index({ userId: 1, mealType: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Token', tokenSchema);