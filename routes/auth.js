const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'ስም፣ ኢሜይል እና የይለፍ ቃል ያስፈልጋል' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'የይለፍ ቃል ቢያንስ 6 ፊደላት መሆን አለበት' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'ይህ ኢሜይል ቀድሞ ተመዝግቧል' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash, approved, blocked) VALUES (?, ?, ?, 0, 0)')
    .run(name.trim(), email.toLowerCase(), hash);
  const io = req.app.get('io');
  if (io) {
    io.to('admin_room').emit('new_registration', { name: name.trim(), email: email.toLowerCase() });
  }
  res.status(201).json({
    message: 'ቤᘍረት ታሳቨል። አስተዳዳሪውን ሲያቌዀቍ። መግባቭ። ይኆቀሏል' });
});
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'ኢሜይል እና የይለፍ ቃል ያስፈልጋል' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም' });
  }
  if (user.blocked) {
    return res.status(403).json({ error: 'መለያዎ ታግዷል። አስተዳዳሪግን ያነጋግሩ።', blocked: true });
  }
  if (!user.approved) {
    return res.status(403).json({
      error: 'ᇌ...ሷሞ ያገና። አልጸደቀም አስተዳዳሪው እስኪሰ...',
      status: 'pending_approval'
    });
  }
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email.toLowerCase());
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)')
    .run(email.toLowerCase(), code, expiresAt);
  let sentViaSocket = false;
  const io = req.app.get('io');
  if (io) {
    const sockets = io.sockets.sockets;
    sockets.forEach(s => {
      if (s.userEmail === email.toLowerCase()) {
        s.emit('verification_code', { code, expiresIn: 600 });
        sentViaSocket = true;
      }
    });
  }
  res.json({
    message: 'የማረጋገጫ ኮድ ተልኳል',
    requiresVerification: true,
    email: email.toLowerCase(),
    code: code,
    codeExpiresIn: 600,
    sentViaSocket: sentViaSocket
  });
});
router.post('/verify', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'ኢሜይል እና ኮድ ያስፈልጋል' });
  }
  const record = db.prepare(
    "SELECT * FROM verification_codes WHERE user_email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
  ).get(email.toLowerCase(), code);
  if (!record) {
    return res.status(401).json({ error: 'ኮዱ ትክክል አይደለም ወይም ጊዜው አልፏል።
 });
  }
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);
  const user = db.prepare('SELECT name, email FROM users WHERE email = ?').get(email.toLowerCase());
  const token = generateToken(user);
  res.json({ token, user });
});
router.post('/admin-login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'ኢሜይል እና የይለፍ ቃል ያስፈልጋል' });
  }
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@yodit.app';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@Yodit2024!';
  if (email !== adminEmail || password !== adminPass) {
    return res.status(401).json({ error: 'የአስተዳዳሪ መረጃ ትክክል አይደለም' });
  }
  const user = { name: 'Admin', email: adminEmail, isAdmin: true };
  const token = generateToken(user);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (existing) {
    db.prepare("UPDATE users SET online = 1, approved = 1, last_seen = datetime('now') WHERE email = ?").run(adminEmail);
  }
  res.json({ token, user });
});
router.post('/resend-code', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'ኢሜይል ያስፈልጋል' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'ተጠቃሚ አልተገኘም' });
  if (!user.approved) return res.status(403).json({ error: 'መለያዎ ገና አልጸደቀም' });
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email.toLowerCase());
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)')
    .run(email.toLowerCase(), code, expiresAt);
  const io = req.app.get('io');
  if (io) {
    const sockets = io.sockets.sockets;
    sockets.forEach(s => {
      if (s.userEmail === email.toLowerCase()) {
        s.emit('verification_code', { code, expiresIn: 600 });
      }
    });
  }
  res.json({ message: 'አዲስ ኮድ ተፍጥሯል', code: code, codeExpiresIn: 600 });
});
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT name, email, approved, blocked, created_at, last_seen FROM users WHERE email = ?').get(req.user.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});
module.exports = router;
