const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'yodit-super-secret-key';
function generateToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name, isAdmin: user.email === 'admin@yodit.app' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = verifyToken(header.split(' ')[1]);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware, JWT_SECRET };
