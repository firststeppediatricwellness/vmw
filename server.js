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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ---------------------------------------------------------
// DATA LAYER (Smart Fallback)
// ---------------------------------------------------------
let MODE = 'JSON';

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ MODE: CLOUD (Connected to MongoDB Atlas)');
      MODE = 'MONGODB';
    })
    .catch(err => {
      console.error('❌ MongoDB connection error:', err);
      console.log('⚠️ FALLBACK: Using Local JSON storage');
    });
} else {
  console.log('ℹ️ MODE: LOCAL (Using Local JSON storage)');
}

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
  firstName: String, email: String, mobile: String, username: String, password: String,
  status: { type: String, default: 'Pending' }, timestamp: { type: Date, default: Date.now }
}, { strict: false }));

// ---------------------------------------------------------
// Generic Data Store Functions
// ---------------------------------------------------------
const DATA_PATHS = {
  jobs: path.join(__dirname, 'data', 'jobs.json'),
  matrimony: path.join(__dirname, 'data', 'matrimony.json'),
  events: path.join(__dirname, 'data', 'events.json'),
  tours: path.join(__dirname, 'data', 'tours.json'),
  updates: path.join(__dirname, 'data', 'updates.json'),
  gallery: path.join(__dirname, 'data', 'gallery.json'),
  registrations: path.join(__dirname, 'data', 'registrations.json'),
  users: path.join(__dirname, 'data', 'users.json')
};

async function readJSON(key) {
  await fs.ensureFile(DATA_PATHS[key]);
  const content = await fs.readFile(DATA_PATHS[key], 'utf8');
  return content ? JSON.parse(content) : [];
}

async function writeJSON(key, data) {
  await fs.writeJson(DATA_PATHS[key], data, { spaces: 2 });
}

function createStoreMethods(key, Model) {
  return {
    async get() {
      return MODE === 'MONGODB' ? Model.find().sort({ date: -1 }) : readJSON(key);
    },
    async add(data) {
      if (MODE === 'MONGODB') return new Model(data).save();
      const items = await readJSON(key);
      const newItem = { id: Date.now().toString(), ...data, date: new Date().toISOString() };
      items.push(newItem);
      await writeJSON(key, items);
      return newItem;
    },
    async update(id, data) {
      if (MODE === 'MONGODB') return Model.findByIdAndUpdate(id, data, { new: true });
      const items = await readJSON(key);
      const idx = items.findIndex(i => (i.id == id || i._id == id));
      if (idx !== -1) { items[idx] = { ...items[idx], ...data }; await writeJSON(key, items); return items[idx]; }
      return null;
    },
    async delete(id) {
      if (MODE === 'MONGODB') return Model.findByIdAndDelete(id);
      const items = (await readJSON(key)).filter(i => (i.id != id && i._id != id));
      await writeJSON(key, items);
    }
  };
}

const Store = {
  jobs: createStoreMethods('jobs', Job),
  matrimony: createStoreMethods('matrimony', Profile),
  events: createStoreMethods('events', Event),
  tours: createStoreMethods('tours', Tour),
  updates: createStoreMethods('updates', Update),
  gallery: createStoreMethods('gallery', Gallery),
  registrations: {
    async get() {
      return MODE === 'MONGODB' ? Registration.find().sort({ timestamp: -1 }) : readJSON('registrations');
    },
    async add(data) {
      if (MODE === 'MONGODB') return new Registration(data).save();
      const regs = await readJSON('registrations');
      const newReg = { id: 'REG' + Date.now(), ...data, status: 'Pending', timestamp: new Date().toISOString() };
      regs.push(newReg);
      await writeJSON('registrations', regs);
      return newReg;
    },
    async update(id, data) {
      if (MODE === 'MONGODB') return Registration.findByIdAndUpdate(id, data, { new: true });
      const regs = await readJSON('registrations');
      const idx = regs.findIndex(r => (r.id == id || r._id == id));
      if (idx !== -1) { regs[idx] = { ...regs[idx], ...data }; await writeJSON('registrations', regs); return regs[idx]; }
      return null;
    },
    async delete(id) {
      if (MODE === 'MONGODB') return Registration.findByIdAndDelete(id);
      const regs = (await readJSON('registrations')).filter(r => (r.id != id && r._id != id));
      await writeJSON('registrations', regs);
    }
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
  res.json({ mode: MODE, connected: mongoose.connection.readyState === 1 });
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
