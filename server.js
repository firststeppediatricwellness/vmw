require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'vmwf_secret_key_2024';
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ---------------------------------------------------------
// DATA LAYER (MongoDB Only)
// ---------------------------------------------------------
if (!MONGODB_URI) {
  console.error('❌ FATAL ERROR: MONGODB_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ---------------------------------------------------------
// Mongoose Models
// ---------------------------------------------------------
const Job = mongoose.model('Job', new mongoose.Schema({
  title: String, location: String, category: String, description: String, 
  contactName: String, contactPhone: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Profile = mongoose.model('Profile', new mongoose.Schema({
  name: String, age: Number, profession: String, location: String, category: String, description: String,
  contactPhone: String, parentsName: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Event = mongoose.model('Event', new mongoose.Schema({
  title: String, description: String, location: String, contactName: String, contactPhone: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Tour = mongoose.model('Tour', new mongoose.Schema({
  title: String, description: String, location: String, contactName: String, contactPhone: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Update = mongoose.model('Update', new mongoose.Schema({
  description: String, link: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Gallery = mongoose.model('Gallery', new mongoose.Schema({
  imagePath: String, caption: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Registration = mongoose.model('Registration', new mongoose.Schema({
  firstName: String, middleName: String, lastName: String, email: String, 
  dob: String, age: String, gender: String, address: String, 
  mobile: String, aadhaar: String, gothra: String, introducer: String, 
  membershipType: String, paymentDetails: String, username: String, password: String,
  status: { type: String, default: 'Pending' }, 
  timestamp: { type: Date, default: Date.now }
}, { strict: false }));

// ---------------------------------------------------------
// Data Store Abstraction (MongoDB)
// ---------------------------------------------------------
function createStoreMethods(Model) {
  return {
    get: async () => Model.find().sort({ date: -1 || { timestamp: -1 } }),
    add: async (data) => new Model(data).save(),
    update: async (id, data) => Model.findByIdAndUpdate(id, data, { new: true }),
    delete: async (id) => Model.findByIdAndDelete(id)
  };
}

const Store = {
  jobs: createStoreMethods(Job),
  matrimony: createStoreMethods(Profile),
  events: createStoreMethods(Event),
  tours: createStoreMethods(Tour),
  updates: createStoreMethods(Update),
  gallery: createStoreMethods(Gallery),
  registrations: {
    get: async () => Registration.find().sort({ timestamp: -1 }),
    add: async (data) => new Registration(data).save(),
    update: async (id, data) => Registration.findByIdAndUpdate(id, data, { new: true }),
    delete: async (id) => Registration.findByIdAndDelete(id)
  }
};

// ---------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
}

// ---------------------------------------------------------
// Routes
// ---------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({ mode: 'MONGODB', connected: mongoose.connection.readyState === 1 });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username, role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
    return res.json({ success: true, token, role: 'admin' });
  }

  try {
    const users = await Store.registrations.get();
    const user = users.find(u => 
      (u.username === username || u.email === username || u.aadhaar === username) && 
      u.password === password
    );

    if (user) {
      if (user.status !== 'Active') {
        return res.status(403).json({ success: false, message: 'Account pending approval' });
      }
      const token = jwt.sign({ id: user._id || user.id, username: user.username, role: 'member' }, SECRET_KEY, { expiresIn: '24h' });
      return res.json({ success: true, token, role: 'member' });
    }
  } catch (err) { console.error('Login error:', err); }

  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Helper to generate generic routes
function setupRoutes(slug, storeKey) {
  app.get(`/api/${slug}`, async (req, res) => { res.json(await Store[storeKey].get()); });
  app.post(`/api/admin/${slug}`, authenticateToken, async (req, res) => { res.status(201).json(await Store[storeKey].add(req.body)); });
  app.put(`/api/admin/${slug}/:id`, authenticateToken, async (req, res) => { res.json(await Store[storeKey].update(req.params.id, req.body)); });
  app.delete(`/api/admin/${slug}/:id`, authenticateToken, async (req, res) => { await Store[storeKey].delete(req.params.id); res.json({ message: 'Deleted' }); });
}

setupRoutes('jobs', 'jobs');
setupRoutes('matrimony', 'matrimony');
setupRoutes('events', 'events');
setupRoutes('tours', 'tours');
setupRoutes('updates', 'updates');
setupRoutes('gallery', 'gallery');

app.get('/api/admin/registrations', authenticateToken, async (req, res) => { res.json(await Store.registrations.get()); });
app.post('/api/register', async (req, res) => { res.status(201).json(await Store.registrations.add(req.body)); });
app.delete('/api/admin/registrations/:id', authenticateToken, async (req, res) => { await Store.registrations.delete(req.params.id); res.json({ message: 'Deleted' }); });
app.patch('/api/admin/registrations/:id', authenticateToken, async (req, res) => { res.json(await Store.registrations.update(req.params.id, req.body)); });

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
