const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.get('/data', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT data_json FROM user_data WHERE email = ?').get(req.user.email);
  if (!row) return res.json({ data: {} });
  try {
    res.json({ data: JSON.parse(row.data_json) });
  } catch {
    res.json({ data: {} });
  }
});
router.post('/data', authMiddleware, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No data provided' });
  const json = JSON.stringify(data);
  db.prepare(`
    INSERT INTO user_data (email, data_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(email) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')
  `).run(req.user.email, json);
  res.json({ message: 'Saved', updatedAt: new Date().toISOString() });
});
router.get('/sync', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT data_json, updated_at FROM user_data WHERE email = ?').get(req.user.email);
  if (!row) return res.json({ data: {}, updatedAt: null });
  try {
    res.json({ data: JSON.parse(row.data_json), updatedAt: row.updated_at });
  } catch {
    res.json({ data: {}, updatedAt: null });
  }
});
module.exports = router;
