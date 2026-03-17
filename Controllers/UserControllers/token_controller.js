const Token = require('../../Models/tokenModel');
const Counter = require('../../Models/counterModels');
const User = require('../../Models/users'); 
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

const PRINTER_BOYS_IP = '10.13.67.44'; 
const PRINTER_GIRLS_IP = '10.13.xx.xx'; 

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * HELPER: Ultra-Fast Printing for High-Concurrency
 */
const autoPrint = async (tokenData, userName, gender, attempt = 1) => {
    const printerIp = gender === 'Male' ? PRINTER_BOYS_IP : PRINTER_GIRLS_IP;
    const MAX_ATTEMPTS = 5; 

    let printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${printerIp}:9100`, 
        characterSet: 'PC437_USA',
        removeSpecialCharacters: false,
        timeout: 3000, // Reduced timeout for faster failure/retry cycles
    });

    try {
        const isConnected = await printer.isPrinterConnected();
        
        if (!isConnected) {
            if (attempt <= MAX_ATTEMPTS) {
                // Random jitter (1.5s - 2.5s) to prevent all 50 students retrying at the same microsecond
                const retryDelay = 1500 + Math.floor(Math.random() * 1000);
                await wait(retryDelay); 
                return autoPrint(tokenData, userName, gender, attempt + 1);
            }
            return console.error(`❌ Printer timed out for ${userName} after 5 tries.`);
        }

        // --- ULTRA COMPACT FAST DESIGN ---
        printer.alignCenter();
        printer.bold(true);
        printer.println("CHEF HOSPITALITY"); 
        printer.bold(false);
        printer.println("--------------------------------");

        printer.invert(true); 
        printer.println(`  ${tokenData.mealType.toUpperCase()}  `);
        printer.invert(false);
        
        printer.println("TOKEN NUMBER");
        printer.setTextSize(2, 2); 
        printer.bold(true);
        printer.println(tokenData.tokenNumber.toString().padStart(3, '0'));
        printer.setTextNormal();
        printer.bold(false);
        printer.println("--------------------------------");

        // Single line for Name and Info to keep vertical height small
        printer.println(userName.toUpperCase());
        printer.println(`${tokenData.date} | ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
        
        printer.bold(true);
        printer.println("ENJOY YOUR MEAL!");
        printer.bold(false);

        // Standard cut (No extra feeding to save time/paper)
        printer.cut();

        await printer.execute();
    } catch (error) {
        console.error(`❌ Error printing for ${userName}:`, error.message);
    }
};

/**
 * HELPER: Atomic Token Generator
 */
const getNextTokenNumber = async (mealType, date) => {
    const sequenceName = `${mealType.toLowerCase()}_${date}`;
    const counter = await Counter.findByIdAndUpdate(
        sequenceName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

// --- MAIN CONTROLLER ---
exports.generateToken = async (req, res) => {
  try {
    const { mealType } = req.body;
    const userId = req.user.id; 

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const today = new Date().toISOString().slice(0, 10);

    // 1. Check for duplicates (Fast)
    const existingToken = await Token.findOne({ userId, mealType, date: today });
    if (existingToken) {
        return res.status(409).json({ success: false, message: `Already have a token for ${mealType}.` });
    }
    
    // 2. Generate Number (Fast Atomic Operation)
    const tokenNumber = await getNextTokenNumber(mealType, today);

    // 3. Save Record
    const newToken = new Token({ userId, mealType, tokenNumber, date: today });
    await newToken.save();
    
    // 4. Fire-and-Forget Print (This is the "Fast" part - no await)
    autoPrint(newToken, user.name, user.gender);

    // 5. Instantly tell the Student App it's done
    res.status(201).json({ 
        success: true, 
        message: "Token generated! Collect your slip.",
        token: newToken 
    });

  } catch (error) {
    console.error("Token Error:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ... History and Stats remain the same ...
exports.getStatsByDate = async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const stats = await Token.aggregate([
            { $match: { date: date } },
            { $group: { _id: '$mealType', count: { $sum: 1 } } }
        ]);
        const formatted = { "Breakfast": 0, "Lunch": 0, "Snacks": 0, "Dinner": 0 };
        stats.forEach(item => { formatted[item._id] = item.count; });
        res.status(200).json(formatted);
    } catch (e) { res.status(500).json({ message: 'Error' }); }
};

exports.getUserTokenHistory = async (req, res) => {
    try {
        const history = await Token.find({ userId: req.user.id }).sort({ generatedAt: -1 }).limit(15);
        res.status(200).json({ success: true, history });
    } catch (e) { res.status(500).json({ message: "Error" }); }
};