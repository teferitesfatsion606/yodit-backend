const express = require('express');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const router = express.Router();
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.name, u.email, u.approved, u.blocked, u.online, u.last_seen, u.created_at,
      d.data_json as user_data, d.updated_at as data_updated
    FROM users u
    LEFT JOIN user_data d ON d.email = u.email
    WHERE u.email != 'admin@yodit.app'
    ORDER BY u.created_at DESC
  `).all();
  const enriched = users.map(u => {
    let health = {};
    try { health = JSON.parse(u.user_data || '{}'); } catch(e) {}
    return {
      name: u.name, email: u.email, approved: u.approved, blocked: u.blocked,
      online: u.online, last_seen: u.last_seen, created_at: u.created_at,
      data_updated: u.data_updated, streak: health.streak || 0,
      best: health.best || 0, phase: health.phase || 0,
      history_count: health.history ? Object.keys(health.history).length : 0,
      has_data: !!u.user_data
    };
  });
  res.json(enriched);
});
router.post('/users/:email/approve', authMiddleware, adminMiddleware, (req, res) => {
  const email = req.params.email;
  const result = db.prepare('UPDATE users SET approved = 1 WHERE email = ? AND email != ?')
    .run(email, 'admin@yodit.app');
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ተጠቃሚ አልተገኘም' });
  }
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email);
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)')
    .run(email, code, expiresAt);
  const io = req.app.get('io');
  if (io) {
    const sockets = io.sockets.sockets;
    sockets.forEach(s => {
      if (s.userEmail === email) {
        s.emit('account_approved', { message: 'መለያዎ ጸድቋል!' });
        s.emit('verification_code', { code, expiresIn: 600 });
      }
    });
  }
  res.json({ message: 'ተጠቃሚው ጸድቋል ✓', code: code, email: email });
});
router.post('/users/:email/resend-code', authMiddleware, adminMiddleware, (req, res) => {
  const email = req.params.email;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'ተጠቃሚ አልተገኘም' });
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("UPDATE verification_codes SET used = 1 WHERE user_email = ? AND used = 0").run(email);
  db.prepare('INSERT INTO verification_codes (user_email, code, expires_at) VALUES (?, ?, ?)')
    .run(email, code, expiresAt);
  const io = req.app.get('io');
  if (io) {
    const sockets = io.sockets.sockets;
    sockets.forEach(s => {
      if (s.userEmail === email) {
        s.emit('verification_code', { code, expiresIn: 600 });
      }
    });
  }
  res.json({ message: 'አዲስ ኮድ ተፍጥሯል', code: code, email: email });
});
router.post('/users/:email/block', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('UPDATE users SET blocked = 1, online = 0 WHERE email = ? AND email != ?')
    .run(req.params.email, 'admin@yodit.app');
  const io = req.app.get('io');
  if (io) {
    const sockets = io.sockets.sockets;
    sockets.forEach(s => {
      if (s.userEmail === req.params.email) {
        s.emit('account_blocked', { message: 'መለያዎ ታግዷል።' });
        s.disconnect();
      }
    });
  }
  res.json({ message: 'ተጠቃሚው ታግዷል' });
});
router.post('/users/:email/unblock', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('UPDATE users SET blocked = 0 WHERE email = ? AND email != ?')
    .run(req.params.email, 'admin@yodit.app');
  res.json({ message: 'እገ샳 ተነስቷል' });
});
router.post('/message', authMiddleware, adminMiddleware, (req, res) => {
  const { to, toAll, title, body } = req.body;
  if (!body) return res.status(400).json({ error: 'መልክት ያስፈልጋል' });
  if (toAll) {
    const users = db.prepare("SELECT email FROM users WHERE approved = 1 AND email != 'admin@yodit.app'").all();
    users.forEach(u => {
      db.prepare('INSERT INTO messages (to_email, title, body, to_all) VALUES (?, ?, ?, 1)')
        .run(u.email, title || null, body);
    });
    const io = req.app.get('io');
    if (io) io.emit('new_message', { title, body });
    return res.json({ message: ``� ${users.length} ዩዘሮች ተልኳል` });
  }
  if (!to || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ error: 'ተጤባ። ያስፈልጋል፦' });
  } 
  to.forEach(email => {
    db.prepare('INSERT INTO messages (to_email, title, body, to_all) VALUES (?, ?, ?, 0)')
      .run(email.toLowerCase(), title || null, body);
    const io = req.app.get('io');
    if (io) {
      const sockets = io.sockets.sockets;
      sockets.forEach(s => {
        if (s.userEmail === email.toLowerCase()) {
          s.emit('new_message', { title, body });
        }
      });
    }
  });
  res.json({ message: `ለ ${to.length} ዩዘርውች ተልኳል` });
});
router.get('/messages/stats', authMiddleware, adminMiddleware, (req, res) => {
  const msgs = db.prepare(`
    SELECT m.*, 
      CASE WHEN m.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM messages m 
    ORDER BY m.sent_at DESC 
    LIMIT 100
  `).all();
  const grouped = {};
  msgs.forEach(m => {
    const key = m.title || m.body.substring(0, 30);
    if (!grouped[key]) {
      grouped[key] = { ...m, readBy: [] };
    }
    if (m.is_read) grouped[key].readBy.push(m.to_email);
  });
  res.json(Object.values(grouped));
});
router.get('/users/:email/data', authMiddleware, adminMiddleware, (req, res) => {
  const email = req.params.email;
  const profile = db.prepare('SELECT name, email, approved, blocked, online, last_seen, created_at FROM users WHERE email = ?').get(email);
  if (!profile) return res.status(404).json({ error: 'ተጠቃሚ አልተገኘም' });
  const raw = db.prepare('SELECT data_json, updated_at FROM user_data WHERE email = ?').get(email);
  let data = {};
  try { data = JSON.parse((raw && raw.data_json) || '{}'); } catch(e) {}
  res.json({ profile, data, updated_at: raw ? raw.updated_at : null });
});
module.exports = router;
