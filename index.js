const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const https = require('https');

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
        // Check for Audio (MP3, M4A, etc.)
        if (file.mimetype.startsWith('audio/') || file.originalname.endsWith('.mp3')) {
            sentMessage = await bot.sendAudio(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } 
        else if (file.mimetype.startsWith('image/')) {
            sentMessage = await bot.sendPhoto(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } 
        else if (file.mimetype.startsWith('video/')) {
            sentMessage = await bot.sendVideo(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        } 
        else {
            sentMessage = await bot.sendDocument(ADMIN_CHAT_ID, file.buffer, {}, fileOptions);
        }

        let fileId, isVideo = false, isImage = false, isAudio = false;
        
        if (sentMessage.audio) {
            fileId = sentMessage.audio.file_id;
            isAudio = true;
        } else if (sentMessage.photo) {
            fileId = sentMessage.photo[sentMessage.photo.length - 1].file_id;
            isImage = true;
        } else if (sentMessage.video) {
            fileId = sentMessage.video.file_id;
            isVideo = true;
        } else if (sentMessage.document) {
            fileId = sentMessage.document.file_id;
        }

        galleryFiles.push({
            id: Date.now().toString(),
            name: file.originalname,
            type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document',
            fileId: fileId
        });

        res.json({ success: true, message: 'File uploaded successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
    }
});

app.get('/api/gallery', (req, res) => {
    res.json({ success: true, files: galleryFiles });
});

// --- DIRECT STREAM PROXY (Fixes video/audio playback & direct links) ---
app.get('/api/view/:id', async (req, res) => {
    const fileObj = galleryFiles.find(f => f.id === req.params.id);
    if (!fileObj) return res.status(404).send('File not found');

    try {
        const fileLink = await bot.getFileLink(fileObj.fileId);
        
        // Fetch from Telegram and pipe directly to the browser
        https.get(fileLink, (telegramRes) => {
            // Force the browser to play/view it instead of downloading
            let contentType = telegramRes.headers['content-type'] || 'application/octet-stream';
            if (fileObj.type === 'audio') contentType = 'audio/mpeg';
            if (fileObj.type === 'video') contentType = 'video/mp4';
            
            res.setHeader('Content-Type', contentType);
            // Inline tells the browser to open it, attachment tells it to download
            res.setHeader('Content-Disposition', 'inline'); 
            
            if (telegramRes.headers['content-length']) {
                res.setHeader('Content-Length', telegramRes.headers['content-length']);
            }
            telegramRes.pipe(res);
        });
    } catch (error) {
        res.status(500).send('Error loading file');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
