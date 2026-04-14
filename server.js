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
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Profile = mongoose.model('Profile', new mongoose.Schema({
  name: String, age: Number, profession: String, location: String, category: String, description: String,
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}));

const Registration = mongoose.model('Registration', new mongoose.Schema({
  firstName: String, email: String, mobile: String, username: String, password: String,
  status: { type: String, default: 'Pending' }, timestamp: { type: Date, default: Date.now }
}, { strict: false })); // Allow flexible registration data

// ---------------------------------------------------------
// Generic Data Store Functions
// ---------------------------------------------------------
const DATA_PATHS = {
  jobs: path.join(__dirname, 'data', 'jobs.json'),
  matrimony: path.join(__dirname, 'data', 'matrimony.json'),
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

const Store = {
  // Jobs
  async getJobs() {
    return MODE === 'MONGODB' ? Job.find().sort({ date: -1 }) : readJSON('jobs');
  },
  async addJob(data) {
    if (MODE === 'MONGODB') return new Job(data).save();
    const jobs = await readJSON('jobs');
    const newJob = { id: Date.now().toString(), ...data, date: new Date().toISOString() };
    jobs.push(newJob);
    await writeJSON('jobs', jobs);
    return newJob;
  },
  async updateJob(id, data) {
    if (MODE === 'MONGODB') return Job.findByIdAndUpdate(id, data, { new: true });
    const jobs = await readJSON('jobs');
    const idx = jobs.findIndex(j => j.id == id);
    if (idx !== -1) { jobs[idx] = { ...jobs[idx], ...data }; await writeJSON('jobs', jobs); return jobs[idx]; }
    return null;
  },
  async deleteJob(id) {
    if (MODE === 'MONGODB') return Job.findByIdAndDelete(id);
    const jobs = (await readJSON('jobs')).filter(j => j.id != id);
    await writeJSON('jobs', jobs);
  },

  // Matrimony
  async getProfiles() {
    return MODE === 'MONGODB' ? Profile.find().sort({ date: -1 }) : readJSON('matrimony');
  },
  async addProfile(data) {
    if (MODE === 'MONGODB') return new Profile(data).save();
    const profiles = await readJSON('matrimony');
    const newProfile = { id: Date.now().toString(), ...data, date: new Date().toISOString() };
    profiles.push(newProfile);
    await writeJSON('matrimony', profiles);
    return newProfile;
  },
  async updateProfile(id, data) {
    if (MODE === 'MONGODB') return Profile.findByIdAndUpdate(id, data, { new: true });
    const profiles = await readJSON('matrimony');
    const idx = profiles.findIndex(p => p.id == id);
    if (idx !== -1) { profiles[idx] = { ...profiles[idx], ...data }; await writeJSON('matrimony', profiles); return profiles[idx]; }
    return null;
  },
  async deleteProfile(id) {
    if (MODE === 'MONGODB') return Profile.findByIdAndDelete(id);
    const profiles = (await readJSON('matrimony')).filter(p => p.id != id);
    await writeJSON('matrimony', profiles);
  },

  // Registrations
  async getRegistrations() {
    return MODE === 'MONGODB' ? Registration.find().sort({ timestamp: -1 }) : readJSON('registrations');
  },
  async addRegistration(data) {
    if (MODE === 'MONGODB') return new Registration(data).save();
    const regs = await readJSON('registrations');
    const newReg = { id: 'REG' + Date.now(), ...data, status: 'Pending', timestamp: new Date().toISOString() };
    regs.push(newReg);
    await writeJSON('registrations', regs);
    return newReg;
  },
  async updateRegistration(id, data) {
    if (MODE === 'MONGODB') return Registration.findByIdAndUpdate(id, data, { new: true });
    const regs = await readJSON('registrations');
    const idx = regs.findIndex(r => (r.id == id || r._id == id));
    if (idx !== -1) { regs[idx] = { ...regs[idx], ...data }; await writeJSON('registrations', regs); return regs[idx]; }
    return null;
  },
  async deleteRegistration(id) {
    if (MODE === 'MONGODB') return Registration.findByIdAndDelete(id);
    const regs = (await readJSON('registrations')).filter(r => (r.id != id && r._id != id));
    await writeJSON('registrations', regs);
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

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  // Local admin fallback
  if (username === 'admin' && password === 'admin123') {
     const token = jwt.sign({ username: 'admin' }, SECRET_KEY, { expiresIn: '24h' });
     return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.get('/api/jobs', async (req, res) => { res.json(await Store.getJobs()); });
app.post('/api/admin/jobs', authenticateToken, async (req, res) => { res.status(201).json(await Store.addJob(req.body)); });
app.put('/api/admin/jobs/:id', authenticateToken, async (req, res) => { res.json(await Store.updateJob(req.params.id, req.body)); });
app.delete('/api/admin/jobs/:id', authenticateToken, async (req, res) => { await Store.deleteJob(req.params.id); res.json({ message: 'Deleted' }); });

app.get('/api/matrimony', async (req, res) => { res.json(await Store.getProfiles()); });
app.post('/api/admin/matrimony', authenticateToken, async (req, res) => { res.status(201).json(await Store.addProfile(req.body)); });
app.put('/api/admin/matrimony/:id', authenticateToken, async (req, res) => { res.json(await Store.updateProfile(req.params.id, req.body)); });
app.delete('/api/admin/matrimony/:id', authenticateToken, async (req, res) => { await Store.deleteProfile(req.params.id); res.json({ message: 'Deleted' }); });

app.get('/api/admin/registrations', authenticateToken, async (req, res) => { res.json(await Store.getRegistrations()); });
app.post('/api/register', async (req, res) => { res.status(201).json(await Store.addRegistration(req.body)); });
app.delete('/api/admin/registrations/:id', authenticateToken, async (req, res) => { await Store.deleteRegistration(req.params.id); res.json({ message: 'Deleted' }); });
app.patch('/api/admin/registrations/:id', authenticateToken, async (req, res) => { res.json(await Store.updateRegistration(req.params.id, req.body)); });

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
