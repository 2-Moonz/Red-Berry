const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');

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

// AI keys and model (comma-separated keys in GEMINI_KEYS)
const GEMINI_KEYS_RAW = process.env.GEMINI_KEYS || '';
const GEMINI_KEYS = GEMINI_KEYS_RAW.split(',').map(s => s.trim()).filter(Boolean);
// Primary model and optional fallbacks. Use GEMINI_MODEL for primary and
// GEMINI_MODEL_FALLBACKS (comma-separated) for fallback candidates.
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'text-bison-001').trim();
const GEMINI_MODEL_FALLBACKS_RAW = process.env.GEMINI_MODEL_FALLBACKS || '';
const GEMINI_MODEL_FALLBACKS = GEMINI_MODEL_FALLBACKS_RAW
  .split(',')
  .map(s => String(s || '').trim())
  .filter(Boolean);

// Build a prioritized list of candidate models to try (primary first)
function candidateModelsList(requested) {
  const list = [];
  if (requested) list.push(requested);
  if (GEMINI_MODEL) list.push(GEMINI_MODEL);
  for (const m of GEMINI_MODEL_FALLBACKS) if (!list.includes(m)) list.push(m);
  // Ensure at least one safe fallback exists
  if (!list.includes('text-bison-001')) list.push('text-bison-001');
  return list;
}

// POST /api/ai { prompt: string, model?: string }
app.post('/api/ai', async (req, res) => {
  const userPrompt = String((req.body && req.body.prompt) || '').trim();
  if (!userPrompt) return res.status(400).json({ error: 'prompt required' });

  if (GEMINI_KEYS.length === 0) return res.status(500).json({ error: 'no api keys configured' });

  // System instruction: act as a friendly student tutor and produce quiz code samples when appropriate
  const systemInstruction = `You are Aura Tutor, a helpful AI tutor for students. Always respond as a supportive teacher: provide clear explanations, step-by-step solutions, and concise summaries. When the user requests practice, quizzes, or exam preparation, generate a short practice quiz (3-8 questions) with correct answers. Additionally, include a runnable sample (HTML + CSS + JavaScript) that implements the quiz UI so the student can test themselves.

When producing a quiz sample, include at least 400 lines of code (this may include HTML, CSS, JS, and explanatory comments). If the model is restricted by token limits and cannot produce the full 400 lines, produce as large and complete a runnable sample as possible and clearly mark that the output was truncated. Label code sections clearly and provide the correct answers in a separate JSON block (in a top HTML comment) immediately before the HTML fragment. Do not hallucinate facts; when uncertain, say you are unsure and suggest how to verify the answer.`;

  const fullPrompt = systemInstruction + "\n\nUser: " + userPrompt;

  // Determine requested model from client (if present). Sanitize common forms.
  let requestedModel = '';
  if (req.body && req.body.model) requestedModel = String(req.body.model).trim();

  // Strip any leading 'models/' or URL fragments that might have been provided
  const sanitizeModel = (m) => {
    if (!m) return m;
    // examples to strip: 'models/gemini-2.5-...' or full URL pieces
    return m.replace(/^\s*models\//i, '').replace(/^(?:https?:\/\/)?[\w.-]*\/models\//i, '').trim();
  };

  const candidates = candidateModelsList(sanitizeModel(requestedModel));

  let lastErr = null;

  // Try each API key and for each key try the candidate models in order until one succeeds.
  for (const key of GEMINI_KEYS) {
    for (const candidateModelRaw of candidates) {
      const modelToUse = sanitizeModel(candidateModelRaw) || 'text-bison-001';
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta2/models/${encodeURIComponent(modelToUse)}:generateText?key=${encodeURIComponent(key)}`;
        const body = {
          prompt: { text: fullPrompt },
          temperature: 0.2,
          // Request a larger output; actual max depends on the model. If you hit limits, the model may truncate.
          maxOutputTokens: 8000
        };

        console.log(`Calling AI: key=<hidden> model=${modelToUse}`);
        const apiRes = await axios.post(url, body, { timeout: 20000 });
        if (apiRes && apiRes.data) {
          let text = '';
          if (apiRes.data.candidates && apiRes.data.candidates.length) {
            text = apiRes.data.candidates.map(c => c.output || c).join('\n');
          } else if (apiRes.data.output && apiRes.data.output[0] && apiRes.data.output[0].content) {
            text = apiRes.data.output.map(o => o.content).join('\n');
          } else if (typeof apiRes.data.result === 'string') {
            text = apiRes.data.result;
          } else {
            text = JSON.stringify(apiRes.data);
          }
          return res.json({ text, model: modelToUse });
        }
      } catch (err) {
        lastErr = err;
        const status = err && err.response && err.response.status;
        const errText = err && err.response && err.response.data ? JSON.stringify(err.response.data) : (err && err.message) || String(err);
        console.warn(`AI attempt failed (model=${modelToUse}) status=${status} err=${errText}`);

        // If this was a 404 or model-not-found style error, try the next candidate model with the same key.
        if (status === 404 || (err && err.response && err.response.data && String(err.response.data).toLowerCase().includes('model'))) {
          // try next model candidate
          continue;
        }

        // For other errors (quota, auth, network), break to the next key
        break;
      }
    }
  }

  console.error('All AI keys/models failed', lastErr && lastErr.message);
  return res.status(502).json({ error: 'ai_service_unavailable', detail: (lastErr && lastErr.message) || 'all keys/models failed' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on', PORT));
