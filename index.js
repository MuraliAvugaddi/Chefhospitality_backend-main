require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Import your existing routes
//const authrouter = require('./routes/authRoute'); // Adjust paths if different
const authrouter = require("./Routes/UserRoutes/authRoute"); // Adjust paths if different
//const userRoute = require('./routes/userRoute');
const userRoute = require('./Routes/UserRoutes/user_Routes');
//const adminRoute = require('./routes/adminRoute');
const adminRoute = require('./Routes/AdimeRoutes/adimeRoute');
//const tokenRoute = require('./routes/tokenRoute');
const tokenRoute = require('./Routes/UserRoutes/token_route');
//const getTokenHistory = require('./routes/tokenHistory');
const getTokenHistory = require('./Routes/AdimeRoutes/historyRoute');
const app = express();

// 1. Create HTTP Server for Socket.io
const server = http.createServer(app);

// 2. Initialize Socket.io with CORS for your Bridge
const io = new Server(server, {
    cors: {
        origin: "*", // Allows your laptop bridge to connect from anywhere
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// 3. Make 'io' available to all your Routes/Controllers
app.set('socketio', io);

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('⚡ A device connected to the bridge:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ Device disconnected');
    });
});

// Routes
app.use('/api/auth', authrouter);
app.use('/api', userRoute);
app.use('/api/admin', adminRoute);
app.use('/api/tokens', tokenRoute);
app.use('/api/toeknHostory', getTokenHistory);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// 4. Start Server using 'server.listen' (CRITICAL for Socket.io)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});