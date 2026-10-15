require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Import Routes
const authrouter = require("./Routes/UserRoutes/authRoute");
const userRoute = require('./Routes/UserRoutes/user_Routes');
const adminRoute = require('./Routes/AdimeRoutes/adimeRoute');
const tokenRoute = require('./Routes/UserRoutes/token_route');
const getTokenHistory = require('./Routes/AdimeRoutes/historyRoute');
const dayScholarRoute = require('./Routes/UserRoutes/dayschorls_routes');
const dayScholarAdminRoute = require('./Routes/AdimeRoutes/dayScholreshistory');
const menuRoute = require('./Routes/AdimeRoutes/menuRoute');
const feedbackRoute = require('./Routes/UserRoutes/feedbackRoutes');
const systemNoticeRoute = require('./Routes/AdimeRoutes/systemNoticeRoute'); // ✅ NEW

// 1. Initialize Express App
const app = express();

// 2. CORS configuration (Flutter Web pre-flight & auth)
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"]
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Create HTTP Server for Socket.io
const server = http.createServer(app);

// 4. Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('socketio', io);
app.use((req, res, next) => {
    req.io = io;
    next();
});

io.on('connection', (socket) => {
    console.log('⚡ A device connected to the bridge:', socket.id);
    socket.on('disconnect', () => {
        console.log('❌ Device disconnected');
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend is running smoothly' });
});

// ============================================================
// ROUTES MOUNTING
// ============================================================

// Authentication & Day Scholar Routes
app.use('/api/auth', authrouter);
app.use('/api/auth', dayScholarRoute);

// Core User Routes
app.use('/api', userRoute);

// Menu Routes
app.use('/api', menuRoute);

// Admin Dashboard, Orders & History Routes
app.use('/api/admin', adminRoute);
app.use('/api/admin', dayScholarAdminRoute);
app.use('/api/admin', getTokenHistory);

// Meal Token Routes
app.use('/api/tokens', tokenRoute);

// Feedback Routes
app.use('/api', feedbackRoute);
app.use('/api/admin', feedbackRoute);

// ✅ System / Payment Notice -> GET /api/system/notice
app.use('/api', systemNoticeRoute);

// ============================================================
// JSON 404 HANDLER
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.log("❌ MongoDB Connection Error:", err));

const PORT = process.env.PORT || 5002;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
});