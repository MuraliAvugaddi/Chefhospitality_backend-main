const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        lowercase: true,
        validate: {
            validator: (value) => {
                const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                return re.test(String(value));
            },
            message: "Please enter a valid email address."
        }
    },
    password: {
        type: String,
        required: true
    },
    enrollmentNo: {
        type: String,
        unique: true,
        sparse: true,
    },
    course: {
        type: String,
    },
    year: {
        type: Number,
    },
    phonenumber: {
        type: String,
    },
    hostelblock: {
        type: String,
    },
    room: {
        type: Number,
    },
    gender: {
        type: String,
    },
    // NEW FIELD: Tracks when the user's access ends
    accessExpiresAt: {
        type: Date,
        default: null // null means no active subscription/payment yet
    },
    // Keep this if you want manual admin control, 
    // otherwise, you can remove it and rely solely on accessExpiresAt
    isApproved: {
        type: Boolean,
        default: false 
    }
}, { timestamps: true });

// Password hashing middleware
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;