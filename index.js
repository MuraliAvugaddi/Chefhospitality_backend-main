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
const dayScholarAdminRoute = require('./Routes/AdimeRoutes/dayScholreshistory'); // 👈 Admin Day Scholar Route
const menuRoute = require('./Routes/AdimeRoutes/menuRoute');                      // 👈 Added Menu Route from AdimeRoutes

// 1. Initialize Express App FIRST
const app = express();

// 2. Create HTTP Server for Socket.io
const server = http.createServer(app);

// 3. Initialize Socket.io with CORS for your Bridge
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// 4. Make 'io' available to all your Routes/Controllers
app.set('socketio', io);

// Socket.io Connection Logic
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

// Routes Mounting
app.use('/api/auth', authrouter);
app.use('/api/auth', dayScholarRoute);         // User-side day scholar orders & payments
app.use('/api', userRoute);
app.use('/api', menuRoute);                     // 👈 Handles /api/menu/active and /api/admin/menu/upload
app.use('/api/admin', adminRoute);             // General admin routes
app.use('/api/admin', dayScholarAdminRoute);   // 👈 Admin day scholar orders API (/api/admin/dayscholar-orders)
app.use('/api/tokens', tokenRoute);
//app.use('/api/toeknHostory', getTokenHistory);
app.use('/api/admin', getTokenHistory);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// 5. Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});