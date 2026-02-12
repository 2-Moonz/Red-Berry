const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, 'data.json');
function readData(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e){ return { users:{}, posts:[], community:null }; }
}
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..'))); // serve frontend files

// session middleware
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret', resave:false, saveUninitialized:false, cookie:{ maxAge: 1000*60*60*24 }}));

// Passport Google (optional)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, function(accessToken, refreshToken, profile, cb){
    const data = readData();
    const username = 'g-' + profile.id;
    data.users[username] = data.users[username] || { username, displayName: profile.displayName || username, bio:'', joinedCommunity:false, passwordHash: null };
    // mark lastActive
    data.users[username].lastActive = Date.now();
    writeData(data);
    return cb(null, data.users[username]);
  }));
  app.use(passport.initialize());
}

// Helper middleware
function requireAuth(req, res, next){
  if (req.session && req.session.username) return next();
  return res.status(401).json({ error: 'unauthenticated' });
}

function isCommunityOwner(username){
  const data = readData();
  return data.community && data.community.owner === username;
}

// Auth endpoints (local username/password)
app.post('/auth/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const data = readData();
  if (data.users[username]) return res.status(409).json({ error: 'user exists' });
  const passwordHash = bcrypt.hashSync(password, 10);
  data.users[username] = { username, displayName: displayName || username, bio:'', votes:{}, joinedCommunity:false, passwordHash, banned:false, lastActive: Date.now() };
  writeData(data);
  req.session.username = username;
  res.json({ username, displayName: data.users[username].displayName });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const data = readData();
  const user = data.users[username];
  if (!user) return res.status(404).json({ error: 'no such user' });
  if (user.banned) return res.status(403).json({ error: 'banned' });
  if (!user.passwordHash) return res.status(400).json({ error: 'no local password for user' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  user.lastActive = Date.now();
  writeData(data);
  req.session.username = username;
  res.json({ username, displayName: user.displayName });
});

// Verify Google ID token sent from client and sign the user in via session
app.post('/auth/google/token', (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'id_token required' });
  // verify token with Google's tokeninfo endpoint
  const https = require('https');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(id_token);
  https.get(url, (gRes) => {
    let data = '';
    gRes.on('data', chunk => data += chunk);
    gRes.on('end', () => {
      try {
        const info = JSON.parse(data);
        // info contains: aud, sub, email, name, picture, etc.
        // optionally verify audience
        if (GOOGLE_CLIENT_ID && info.aud && info.aud !== GOOGLE_CLIENT_ID) {
          return res.status(400).json({ error: 'invalid_audience' });
        }
        const username = 'g-' + info.sub;
        const dataFile = readData();
        dataFile.users[username] = dataFile.users[username] || { username, displayName: info.name || username, bio:'', votes:{}, joinedCommunity:false, passwordHash: null };
        dataFile.users[username].lastActive = Date.now();
        writeData(dataFile);
        req.session.username = username;
        return res.json({ username, displayName: dataFile.users[username].displayName });
      } catch (e) {
        return res.status(500).json({ error: 'token_verification_failed' });
      }
    });
  }).on('error', () => res.status(500).json({ error: 'token_verification_failed' }));
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok:true }));
});

app.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.username) return res.json(null);
  const data = readData();
  const u = data.users[req.session.username];
  if (!u) return res.json(null);
  return res.json({ username: u.username, displayName: u.displayName, joinedCommunity: !!u.joinedCommunity, lastActive: u.lastActive });
});

// Community endpoints
app.post('/api/community', requireAuth, (req, res) => {
  const { name } = req.body; if (!name) return res.status(400).json({ error:'name required' });
  const data = readData();
  if (data.community) return res.status(409).json({ error:'community exists' });
  data.community = { name, owner: req.session.username, createdAt: Date.now() };
  writeData(data);
  res.json(data.community);
});
app.get('/api/community', (req, res) => { const data = readData(); res.json(data.community || null); });

// Posts API
app.get('/api/posts', (req, res) => {
  const data = readData(); res.json(data.posts);
});

app.post('/api/posts', requireAuth, (req, res) => {
  const data = readData();
  const { title, body } = req.body;
  const author = req.session.username;
  const post = { id: uuidv4(), title, body, meta: `Posted by ${author} • just now`, author, votes: 0, createdAt: Date.now() };
  data.posts.push(post); writeData(data); res.json(post);
});

app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const { id } = req.params; const { delta } = req.body;
  const data = readData();
  const post = data.posts.find(p=>p.id===id); if(!post) return res.status(404).json({error:'not found'});
  // simple: update votes count
  post.votes = (post.votes||0) + (delta||0);
  // note: tracking per-user votes is left to client or can be saved here
  writeData(data); res.json(post);
});

// Delete post (moderation) - community owner can delete
app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const data = readData();
  if (!isCommunityOwner(req.session.username)) return res.status(403).json({ error:'not moderator' });
  const { id } = req.params; const idx = data.posts.findIndex(p=>p.id===id); if (idx<0) return res.status(404).json({ error:'not found' });
  data.posts.splice(idx,1); writeData(data); res.json({ ok:true });
});

// User list and kick
app.get('/api/users', (req, res) => { const data = readData(); res.json(data.users); });

app.post('/api/users/:username/kick', requireAuth, (req, res) => {
  const target = req.params.username; const data = readData();
  if (!isCommunityOwner(req.session.username)) return res.status(403).json({ error:'not moderator' });
  if (!data.users[target]) return res.status(404).json({ error:'not found' });
  data.users[target].banned = true; writeData(data); res.json({ ok:true });
});

// OAuth routes (only active if passport configured)
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
  app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    // success - set session and redirect
    if (req.user && req.user.username) req.session.username = req.user.username;
    res.redirect('/Pages/red-berry.html');
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on', PORT));

// --- AI proxy endpoint (Gemini / Generative Language API) ---
// POST /api/ai { prompt: string }
// Uses GEMINI_KEYS env var (comma-separated). Tries keys in order until one succeeds.
const axios = require('axios');
const GEMINI_KEYS_RAW = process.env.GEMINI_KEYS || '';
const GEMINI_KEYS = GEMINI_KEYS_RAW.split(',').map(s => s.trim()).filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'text-bison-001';

app.post('/api/ai', async (req, res) => {
  const prompt = String((req.body && req.body.prompt) || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  if (GEMINI_KEYS.length === 0) {
    return res.status(500).json({ error: 'no api keys configured on server (set GEMINI_KEYS)' });
  }

  // Try keys in order
  let lastErr = null;
  for (const key of GEMINI_KEYS) {
    try {
      // allow client to request a model; fallback to server default
      const modelToUse = (req.body && req.body.model) ? String(req.body.model) : GEMINI_MODEL;
      // Use the Generative Language REST endpoint. This example uses API key auth via ?key=.
      const url = `https://generativelanguage.googleapis.com/v1beta2/models/${encodeURIComponent(modelToUse)}:generateText?key=${encodeURIComponent(key)}`;
      const body = {
        prompt: { text: prompt },
        temperature: 0.2,
        maxOutputTokens: 512
      };
      const apiRes = await axios.post(url, body, { timeout: 20000 });
      if (apiRes && apiRes.data) {
        // Attempt to find the text in response structure (best-effort)
        let text = '';
        if (apiRes.data.candidates && apiRes.data.candidates.length) {
          text = apiRes.data.candidates.map(c => c.output || c).join('\n');
        } else if (apiRes.data.output && apiRes.data.output[0] && apiRes.data.output[0].content) {
          // some shapes include output array
          text = apiRes.data.output.map(o => o.content).join('\n');
        } else if (typeof apiRes.data.result === 'string') {
          text = apiRes.data.result;
        } else {
          // fallback: stringify
          text = JSON.stringify(apiRes.data);
        }
        return res.json({ text });
      }
    } catch (err) {
      lastErr = err;
      // on 4xx/5xx try next key for recoverable errors like rate limit
      const status = err && err.response && err.response.status;
      console.warn('AI key failed', status || err.message);
      if (status === 401 || status === 403) {
        // invalid/unauthorized - try next
        continue;
      }
      if (status === 429) {
        // rate limit - try next key
        continue;
      }
      // for network errors try next key as well
      continue;
    }
  }

  console.error('All AI keys failed', lastErr && lastErr.message);
  return res.status(502).json({ error: 'ai_service_unavailable', detail: (lastErr && lastErr.message) || 'all keys failed' });
});
