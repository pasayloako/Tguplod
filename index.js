const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');

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
app.use(express.static('public')); 

// Temporary memory database for uploaded files
// (This resets if the server restarts, but works great for a live demo!)
let galleryFiles = []; 

// --- AUTHENTICATION ROUTES ---
app.post('/api/signup', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ success: false, message: 'Missing fields' });

    try {
        const text = `USER:${name}|PASS:${pass}`;
        const msg = await bot.sendMessage(DB_CHANNEL_ID, text);
        await bot.pinChatMessage(DB_CHANNEL_ID, msg.message_id, { disable_notification: true });
        res.json({ success: true, message: 'Account created successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Telegram Error: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ success: false, message: 'Missing fields' });
    const searchString = `USER:${name}|PASS:${pass}`;
    try {
        const chat = await bot.getChat(DB_CHANNEL_ID);
        if (chat.pinned_message && chat.pinned_message.text === searchString) {
            return res.json({ success: true, message: 'Login successful!' });
        }
        res.status(401).json({ success: false, message: 'Invalid credentials.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Telegram Error: ' + error.message });
    }
});

// --- FILE UPLOADER ROUTE ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const file = req.file;
    const fileOptions = { filename: file.originalname, contentType: file.mimetype };

    try {
        let sentMessage;
        
        // Send to the Admin chat and capture the response
        if (file.mimetype.startsWith('image/')) {
            sentMessage = await bot.sendPhoto(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } else if (file.mimetype.startsWith('video/')) {
            sentMessage = await bot.sendVideo(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } else {
            sentMessage = await bot.sendDocument(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        }

        // Telegram returns the file_id. We save it to our memory gallery.
        let fileId, isVideo = false, isImage = false;
        
        if (file.mimetype.startsWith('image/')) {
            fileId = sentMessage.photo[sentMessage.photo.length - 1].file_id;
            isImage = true;
        } else if (file.mimetype.startsWith('video/')) {
            fileId = sentMessage.video.file_id;
            isVideo = true;
        } else {
            fileId = sentMessage.document.file_id;
        }

        galleryFiles.push({
            id: Date.now().toString(),
            name: file.originalname,
            type: isImage ? 'image' : isVideo ? 'video' : 'document',
            fileId: fileId
        });

        res.json({ success: true, message: 'File uploaded and added to gallery!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
    }
});

// --- GALLERY ROUTE ---
app.get('/api/gallery', (req, res) => {
    res.json({ success: true, files: galleryFiles });
});

// --- VIEW FILE ROUTE (Redirects to Telegram's CDN) ---
app.get('/api/view/:id', async (req, res) => {
    const fileObj = galleryFiles.find(f => f.id === req.params.id);
    if (!fileObj) return res.status(404).send('File not found');

    try {
        // Get the direct file URL from Telegram
        const fileLink = await bot.getFileLink(fileObj.fileId);
        res.redirect(fileLink); // Redirect user to the actual image/video
    } catch (error) {
        res.status(500).send('Error loading file');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
