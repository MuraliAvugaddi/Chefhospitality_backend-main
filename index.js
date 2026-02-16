const express = require('express');
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require('http');
const { Server } = require("socket.io");

// Your existing routes
const authrouter = require("./Routes/UserRoutes/authRoute");
const userRoute = require('./Routes/UserRoutes/user_Routes');
const adminRoute = require('./Routes/AdimeRoutes/adimeRoute.js');
const tokenRoute = require('./Routes/UserRoutes/token_route.js');
const historyRoute = require('./Routes/AdimeRoutes/historyRoute.js');

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Updated Socket.IO Logic ---
let userSockets = {};

io.on('connection', (socket) => {
    console.log(`⚡: A user connected with socket ID: ${socket.id}`);

    // When user connects, they MUST send their userId to map the connection
    socket.on('registerUser', (userId) => {
        if (userId) {
            userSockets[userId] = socket.id;
            console.log(`User ${userId} is now online on socket ${socket.id}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔥: A user disconnected with socket ID: ${socket.id}`);
        // Clean up mapping on disconnect to avoid sending data to dead sockets
        for (let userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

// Middleware to make 'io' and 'userSockets' accessible in your controllers
app.use((req, res, next) => {
    req.io = io;
    req.userSockets = userSockets;
    next();
});

// --- ✅ REGISTER ALL ROUTES ---
app.use('/api/auth', authrouter);
app.use('/api', userRoute);
app.use('/api/admin', adminRoute);
app.use('/api/tokens', tokenRoute);
app.use('/api/admin', historyRoute);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Mongodb is connected successfully"))
    .catch((error) => console.log(error));

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is connected Port at ${PORT}`);
});