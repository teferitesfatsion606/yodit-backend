require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');const { verifyToken } = require('./middleware/auth');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.set('io', io);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Navigation guard for signin flow
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), onlineUsers: getOnlineCount() });
});
const onlineUsers = new Map();
function getOnlineCount() {
  return onlineUsers.size;
}
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  socket.on('authenticate', (token) => {
    try {
      const decoded = verifyToken(token);
      socket.userEmail = decoded.email;
      socket.isAdmin = decoded.isAdmin;
      if (!onlineUsers.has(decoded.email)) {
        onlineUsers.set(decoded.email, new Set());
      }
      onlineUsers.get(decoded.email).add(socket.id);
      db.prepare("UPDATE users SET online = 1, socket_id = ?, last_seen = datetime('now') WHERE email = ?")
        .run(socket.id, decoded.email);
      if (decoded.isAdmin) { socket.join('admin_room'); }
      io.to('admin_room').emit('user_online', { email: decoded.email, online: true });
      io.emit('online_count', getOnlineCount());
      console.log(`[socket] authenticated: ${decoded.email} (${decoded.isAdmin ? 'admin' : 'user'})`);
    } catch (e) {
      socket.emit('auth_error', { message: 'Invalid token' });
    }
  });
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    if (socket.userEmail) {
      const sockets = onlineUsers.get(socket.userEmail);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(socket.userEmail);
          db.prepare("UPDATE users SET online = 0, last_seen = datetime('now') WHERE email = ?")
            .run(socket.userEmail);
          io.to('admin_room').emit('user_offline', { email: socket.userEmail });
        }
      }
      io.emit('online_count', getOnlineCount());
    }
  });
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Endpoint አልተገኘም: ' + req.method + ' ' + req.path });
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'የሰርርሩ ስህተት: ' + (err.message || 'Unknown error') });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  🌬️  ዮዲት ባክንድ ሰርቨር  🌬️              ║
║  Port: ${String(PORT).padEnd(30)}║
║  Admin: http://localhost:${PORT}/admin     ║
║  API:   http://localhost:${PORT}/api       ║
╚═══════════════════════════════════════════╝  `);
});
