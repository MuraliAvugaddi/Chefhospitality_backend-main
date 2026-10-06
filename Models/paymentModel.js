const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', // 👈 Must match mongoose.model('User', userSchema)
        required: true 
    },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['online', 'offline'], required: true },
    transactionId: { type: String },
    month: { type: String, required: true },
    status: { type: String, default: 'Success' },
    paidAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);