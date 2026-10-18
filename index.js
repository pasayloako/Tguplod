const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ⚠️ CONFIGURATION
// ============================================================
const BOT_TOKEN = '8967525504:AAHTzP8DmqIQH_fuN-Lv0ULLMilSG3_HCuM';
const ADMIN_CHAT_ID = '6814236874'; 
const DB_CHANNEL_ID = '-1004491788308'; // Your Channel ID
// ============================================================

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static('public')); // Serves index.html

// --- AUTHENTICATION ROUTES ---

// 1. SIGN UP
app.post('/api/signup', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ success: false, message: 'Missing fields' });

    try {
        const text = `USER:${name}|PASS:${pass}`;
        // Send to the Telegram Channel (Database)
        const msg = await bot.sendMessage(DB_CHANNEL_ID, text);
        
        // Automatically pin the message for faster login checks
        await bot.pinChatMessage(DB_CHANNEL_ID, msg.message_id, { disable_notification: true });
        
        res.json({ success: true, message: 'Account created successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Telegram Error: ' + error.message });
    }
});

// 2. SIGN IN
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ success: false, message: 'Missing fields' });

    const searchString = `USER:${name}|PASS:${pass}`;

    try {
        // Fetch the chat info to check the pinned message
        const chat = await bot.getChat(DB_CHANNEL_ID);
        
        if (chat.pinned_message && chat.pinned_message.text === searchString) {
            return res.json({ success: true, message: 'Login successful!' });
        }

        // If not pinned, we search the recent history (optional, but good for multiple users)
        // Note: Telegram doesn't allow deep history search via bot, so pinning is the best method.
        res.status(401).json({ success: false, message: 'Invalid credentials.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Telegram Error: ' + error.message });
    }
});

// --- FILE UPLOADER ROUTE ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const file = req.file;
    const fileOptions = { filename: file.originalname, contentType: file.mimetype };

    try {
        if (file.mimetype.startsWith('image/')) {
            await bot.sendPhoto(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } else if (file.mimetype.startsWith('video/')) {
            await bot.sendVideo(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } else {
            await bot.sendDocument(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        }
        res.json({ success: true, message: 'File uploaded to Telegram!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
