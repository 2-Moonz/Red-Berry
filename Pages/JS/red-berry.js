// Client-side posts + users with localStorage-based login/profile and gated actions
document.addEventListener('DOMContentLoaded', () => {
	const POSTS_KEY = 'rb_posts_v1';
	const USERS_KEY = 'rb_users_v1';
	const CURRENT_KEY = 'rb_current_user_v1';

	const feedEl = document.querySelector('.feed');
	const openPostBtn = document.getElementById('open-post-btn');
	const createPostEl = document.getElementById('create-post');
	const submitPostBtn = document.getElementById('submit-post');

	// auth elements
	const profileSummary = document.getElementById('profile-summary');
	const profileNameEl = document.getElementById('profile-name');
	const profileUsernameEl = document.getElementById('profile-username');
	const btnLogout = document.getElementById('btn-logout');
	const editProfileBtn = document.getElementById('edit-profile-btn');
	const profileEdit = document.getElementById('profile-edit');
	const editDisplay = document.getElementById('edit-display');
	const editBio = document.getElementById('edit-bio');
	const saveProfileBtn = document.getElementById('save-profile');
	const cancelEditBtn = document.getElementById('cancel-edit');
	const btnJoinCommunity = document.getElementById('btn-join-community');

	// storage helpers
	function loadPosts() {
		const raw = localStorage.getItem(POSTS_KEY);
		if (raw) return JSON.parse(raw);
		// seed from DOM
		const seeded = [];
		document.querySelectorAll('.post-card').forEach(card => {
			const id = card.dataset.postId || card.id || ('post-' + Date.now());
			const title = card.querySelector('.post-title')?.textContent || 'Untitled';
			const body = card.querySelector('.post-body')?.textContent || '';
			const meta = card.querySelector('.post-meta')?.textContent || '';
			seeded.push({ id, title, body, meta, votes: 0, createdAt: Date.now() });
		});
		localStorage.setItem(POSTS_KEY, JSON.stringify(seeded));
		return seeded;
	}
	function savePosts(posts) { localStorage.setItem(POSTS_KEY, JSON.stringify(posts)); }

	function loadUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch(e){return {};}}
	function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

	function getCurrentUsername() { return localStorage.getItem(CURRENT_KEY); }
	function setCurrentUsername(u){ if(u) localStorage.setItem(CURRENT_KEY,u); else localStorage.removeItem(CURRENT_KEY); }

	function getCurrentUser() {
		const u = getCurrentUsername(); if (!u) return null;
		const users = loadUsers(); return users[u] || null;
	}

	function formatCount(n) {
		if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
		return '' + n;
	}

	let posts = [];
	let serverAvailable = false;
    let currentFilter = '';

	// Try to load posts from server; fall back to localStorage
	async function initPosts() {
		try {
			const res = await fetch('/api/posts');
			if (res.ok) {
				const serverPosts = await res.json();
				posts = serverPosts.map(p => ({ ...p }));
				serverAvailable = true;
				return;
			}
		} catch (e) {
			// server not available
			serverAvailable = false;
		}
		// fallback
		posts = loadPosts();
	}

	async function createPostServer(post) {
		try {
			const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: post.title, body: post.body, author: post.meta?.replace('Posted by ', '') || 'unknown' }) });
			if (res.ok) return await res.json();
		} catch(e) {}
		throw new Error('server-failed');
	}

	async function voteOnServer(postId, delta) {
		try {
			const res = await fetch('/api/posts/' + encodeURIComponent(postId) + '/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) });
			if (res.ok) return await res.json();
		} catch(e) {}
		throw new Error('vote-failed');
	}

	// render posts sorted by votes
	function renderPosts() {
		posts.sort((a,b) => (b.votes - a.votes) || (b.createdAt - a.createdAt));
		feedEl.innerHTML = '';
		const current = getCurrentUser();
		posts.filter(p => {
			if (!currentFilter) return true;
			const q = currentFilter.toLowerCase();
			return (p.title && p.title.toLowerCase().includes(q)) || (p.body && p.body.toLowerCase().includes(q));
		}).forEach(p => {
			const article = document.createElement('article');
			article.className = 'post-card'; article.id = p.id; article.dataset.postId = p.id;
			article.innerHTML = `
				<div class="votes">
					<i class="fa-solid fa-arrow-up vote-up" title="Upvote"></i>
					<span class="vote-count">${formatCount(p.votes)}</span>
					<i class="fa-solid fa-arrow-down vote-down" title="Downvote"></i>
				</div>
				<div class="post-content">
					<div class="post-meta">${p.meta || ''}</div>
					<span class="post-title">${escapeHtml(p.title)}</span>
					<p class="post-body">${escapeHtml(p.body)}</p>
					<div class="post-footer">
						<span class="share-btn" data-post-id="${p.id}"><i class="fa-solid fa-share"></i> Share</span>
					</div>
				</div>
			`;

			const up = article.querySelector('.vote-up');
			const down = article.querySelector('.vote-down');

			// if not logged in, show hover but clicking will prompt login
			if (current && current.votes && current.votes[p.id]) {
				up.classList.add('voted-disabled'); down.classList.add('voted-disabled');
			}

			    up.addEventListener('click', (e) => { e.stopPropagation(); attemptVote(p.id, 1); });
			    down.addEventListener('click', (e) => { e.stopPropagation(); attemptVote(p.id, -1); });

			article.querySelectorAll('.share-btn').forEach(sb => {
				sb.addEventListener('click', (ev) => {
					ev.stopPropagation(); const url = window.location.origin + window.location.pathname + '#'+p.id;
					navigator.clipboard?.writeText(url).then(()=>{ sb.textContent='Link copied'; setTimeout(()=> sb.innerHTML = '<i class="fa-solid fa-share"></i> Share',1200); }).catch(()=> alert('Copy failed. URL:\n'+url));
				});
			});

			feedEl.appendChild(article);
		});
		// update user list panel
		showUserList();
	}

	// voting: require login
	async function attemptVote(postId, delta) {
		const current = getCurrentUser();
		if (!current) { showLoginPrompt(); return; }
		if (current.votes && current.votes[postId]) return; // one vote only
		const post = posts.find(p=>p.id===postId); if(!post) return;
		// optimistically update UI
		post.votes = (post.votes||0) + delta;
		current.votes = current.votes || {};
		current.votes[postId] = delta;
		// save user locally
		const users = loadUsers(); users[current.username] = current; saveUsers(users);

		if (serverAvailable) {
			try {
				const updated = await voteOnServer(postId, delta);
				// update local post from server response
				const idx = posts.findIndex(pp => pp.id === updated.id);
				if (idx >= 0) posts[idx] = updated;
			} catch (e) {
				console.warn('Server vote failed, keeping local state');
			}
		}

		savePosts(posts);
		renderPosts();
	}

	function showLoginPrompt(){
		// open the modal for login/signup
		showLoginModal();
	}

	// simple escaping
	function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

	// AUTH: (sidebar login removed) handled by modal; keep renderAuth helpers

	function renderAuth(){
		// Try server-side session first
		(async function(){
			try {
				const res = await fetch('/auth/me');
				if (res.ok) {
					const me = await res.json();
					if (me) {
						// ensure local storage also reflects current user
						const users = loadUsers();
						users[me.username] = users[me.username] || { username: me.username, displayName: me.displayName || me.username, bio:'', votes:{}, joinedCommunity: !!me.joinedCommunity };
						localStorage.setItem('rb_users_v1', JSON.stringify(users));
						localStorage.setItem('rb_current_user_v1', me.username);
					}
				}
			} catch (e) { /* ignore */ }

			const current = getCurrentUser();
			const loginForm = document.getElementById('login-form');
			if (current) {
				if (loginForm) loginForm.style.display = 'none';
				profileSummary.style.display = 'block';
				// hide the sidebar "Log in / Create" button when logged in
				const openLoginBtn = document.getElementById('open-login-btn'); if (openLoginBtn) openLoginBtn.style.display = 'none';
				// ensure post button is visible for logged in users
				const openPostBtn = document.getElementById('open-post-btn'); if (openPostBtn) openPostBtn.style.display = '';
				profileNameEl.textContent = current.displayName || current.username;
				profileUsernameEl.textContent = current.username;
				// populate edit fields
				editDisplay.value = current.displayName || '';
				editBio.value = current.bio || '';
				// update join community button state
				updateJoinButton();
			} else {
				if (loginForm) loginForm.style.display = 'block';
				profileSummary.style.display = 'none';
				const openLoginBtn = document.getElementById('open-login-btn'); if (openLoginBtn) openLoginBtn.style.display = '';
				const openPostBtn = document.getElementById('open-post-btn'); if (openPostBtn) openPostBtn.style.display = 'none';
			}
		})();
	}

	btnLogout?.addEventListener('click', async () => {
		if (serverAvailable) {
			try { await fetch('/auth/logout', { method: 'POST' }); } catch(e) { /* ignore */ }
		}
		setCurrentUsername(null); renderAuth(); renderPosts();
	});

	editProfileBtn?.addEventListener('click', () => { profileEdit.style.display = 'block'; });
	cancelEditBtn?.addEventListener('click', () => { profileEdit.style.display = 'none'; });
	saveProfileBtn?.addEventListener('click', () => {
		const current = getCurrentUser(); if (!current) return; const users = loadUsers();
		current.displayName = editDisplay.value || current.username; current.bio = editBio.value || '';
		users[current.username] = current; saveUsers(users); profileEdit.style.display='none'; renderAuth();
	});

	// Join community: only users with username starting with '2' can join
	btnJoinCommunity?.addEventListener('click', () => {
		const current = getCurrentUser(); if (!current) { showLoginPrompt(); return; }
		if (!current.username.startsWith('2')) { alert('Only special users (username starting with "2") can join this community.'); return; }
		current.joinedCommunity = !current.joinedCommunity;
		const users = loadUsers(); users[current.username] = current; saveUsers(users);
		alert(current.joinedCommunity ? 'You joined r/MidnightAura' : 'You left r/MidnightAura');
		renderAuth();
	});

	function updateJoinButton(){
		const current = getCurrentUser();
		if (!current) { btnJoinCommunity.textContent = 'Join Community'; btnJoinCommunity.disabled = false; return; }
		if (current.username.startsWith('2')){
			btnJoinCommunity.textContent = current.joinedCommunity ? 'Leave Community' : 'Join Community'; btnJoinCommunity.disabled = false;
		} else { btnJoinCommunity.textContent = 'Join Community (restricted)'; btnJoinCommunity.disabled = false; }
	}

	// show active users on left panel
	async function showUserList(){
		const panel = document.getElementById('user-list-items'); if(!panel) return;
		panel.innerHTML = '';
		let usersMap = {};
		if (serverAvailable) {
			try { const res = await fetch('/api/users'); if (res.ok) usersMap = await res.json(); }
			catch(e) { usersMap = loadUsers(); }
		} else { usersMap = loadUsers(); }
		// convert to array and sort by lastActive desc
		const arr = Object.values(usersMap).sort((a,b)=>(b.lastActive||0)-(a.lastActive||0));
		arr.slice(0,10).forEach(u => {
			const el = document.createElement('div'); el.style.fontSize='0.9rem'; el.style.opacity = u.banned ? '0.5' : '1';
			el.textContent = (u.displayName || u.username) + ' (' + u.username + ')';
			panel.appendChild(el);
		});
	}

	// New post UI: require login
	openPostBtn?.addEventListener('click', () => {
		const current = getCurrentUser(); if (!current) { showLoginPrompt(); return; }
		createPostEl.style.display = (createPostEl.style.display === 'none' || !createPostEl.style.display) ? 'flex' : 'none';
	});

	submitPostBtn?.addEventListener('click', async () => {
		const current = getCurrentUser(); if (!current) { showLoginPrompt(); return; }
		const title = document.getElementById('post-title')?.value || 'Untitled';
		const body = document.getElementById('post-body')?.value || '';
		const id = 'post-' + Date.now();
		const newPost = { id, title, body, meta: `Posted by ${current.username} • just now`, votes: 0, createdAt: Date.now() };
		if (serverAvailable) {
			try {
				const created = await createPostServer(newPost);
				posts.push(created);
			} catch (e) {
				// fallback to local
				posts.push(newPost);
				savePosts(posts);
			}
		} else {
			posts.push(newPost);
			savePosts(posts);
		}
		renderPosts();
		document.getElementById('post-title').value = ''; document.getElementById('post-body').value = ''; createPostEl.style.display='none';
	});

	// profile-icon toggle: scroll to auth area
	document.getElementById('profile-toggle')?.addEventListener('click', ()=>{ const a = document.getElementById('auth-area'); if(a) a.scrollIntoView({behavior:'smooth'}); });

	// search bar: filter posts
	const searchBar = document.querySelector('.search-bar');
	searchBar?.addEventListener('input', (e) => { currentFilter = e.target.value || ''; renderPosts(); });

	// Community page handlers and moderation center
	document.getElementById('nav-community')?.addEventListener('click', async (e) => {
		// prevent default navigation so we can show the community panel in-place
		if (e && e.preventDefault) e.preventDefault();
		const page = document.getElementById('community-page');
		page.style.display = 'block';
		try {
			const res = await fetch('/api/community');
			if (res.ok) {
				const c = await res.json();
				if (c) document.getElementById('community-info').textContent = c.name + ' — owner: ' + c.owner;
				else document.getElementById('community-info').textContent = 'No community created yet.';
				// community actions: create if not exists and logged in
				const actions = document.getElementById('community-actions'); actions.innerHTML = '';
				if (!c) {
					const me = getCurrentUser();
					if (me) {
						const btn = document.createElement('button'); btn.className='btn-join'; btn.textContent='Create Community';
						btn.addEventListener('click', async ()=>{
							const name = prompt('Community name?') || 'r/MidnightAura';
							const res = await fetch('/api/community', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
							if (res.ok) { alert('Community created'); const newc = await res.json(); document.getElementById('community-info').textContent = newc.name + ' — owner: ' + newc.owner; if (me.username === newc.owner) { document.getElementById('moderation-center').style.display='block'; await loadModerationCenter(); } }
						});
						actions.appendChild(btn);
					} else {
						const note = document.createElement('div'); note.textContent = 'Log in to create a community.'; actions.appendChild(note);
					}
				}
				const me = getCurrentUser();
				if (me && c && me.username === c.owner) {
					document.getElementById('moderation-center').style.display = 'block';
					await loadModerationCenter();
				} else {
					document.getElementById('moderation-center').style.display = 'none';
				}
			}
		} catch(e) { document.getElementById('community-info').textContent = 'No community info (server unavailable)'; }
	});

	document.getElementById('close-community')?.addEventListener('click', () => {
		document.getElementById('community-page').style.display = 'none';
	});

	async function loadModerationCenter(){
		try {
			const [postsRes, usersRes] = await Promise.all([fetch('/api/posts'), fetch('/api/users')]);
			const postsData = postsRes.ok ? await postsRes.json() : [];
			const usersData = usersRes.ok ? await usersRes.json() : {};
			const modPosts = document.getElementById('mod-posts'); modPosts.innerHTML='';
			postsData.forEach(p => {
				const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.padding='6px 0';
				row.innerHTML = `<div style="flex:1">${p.title} <span style="color:#bbb; font-size:0.85rem">by ${p.author}</span></div>`;
				const del = document.createElement('button'); del.textContent='Delete'; del.className='btn-join'; del.style.marginLeft='8px';
				del.addEventListener('click', async ()=>{ if(confirm('Delete post?')){ await fetch('/api/posts/'+encodeURIComponent(p.id), { method:'DELETE' }); await initPosts(); renderPosts(); await loadModerationCenter(); } });
				row.appendChild(del); modPosts.appendChild(row);
			});

			const modUsers = document.getElementById('mod-users'); modUsers.innerHTML='';
			Object.values(usersData).forEach(u => {
				const r = document.createElement('div'); r.style.display='flex'; r.style.justifyContent='space-between'; r.style.padding='4px 0';
				r.innerHTML = `<div>${u.displayName || u.username} (${u.username})</div>`;
				const kick = document.createElement('button'); kick.textContent='Kick'; kick.className='btn-join'; kick.style.marginLeft='8px';
				kick.addEventListener('click', async ()=>{ if(confirm('Kick user?')){ await fetch('/api/users/'+encodeURIComponent(u.username)+'/kick', { method:'POST' }); await loadModerationCenter(); } });
				r.appendChild(kick); modUsers.appendChild(r);
			});
		} catch(e) { console.warn('mod center load failed', e); }
	}

	// initial render: try server, then render
	// small helper: top-right button popovers
	function setupTopRightButtons(){
		function closePopovers(){ document.querySelectorAll('.top-panel-popover').forEach(p=>p.remove()); }
		function createPopover(html, anchor){ closePopovers(); const pop = document.createElement('div'); pop.className='top-panel-popover'; pop.style.position='absolute'; pop.style.background='var(--card-bg)'; pop.style.color='var(--cream)'; pop.style.border='1px solid var(--border)'; pop.style.padding='12px'; pop.style.borderRadius='8px'; pop.style.minWidth='200px'; pop.style.boxShadow='0 6px 18px rgba(0,0,0,0.5)'; pop.innerHTML = html; document.body.appendChild(pop);
			const r = anchor.getBoundingClientRect(); pop.style.top = (r.bottom + 8 + window.scrollY) + 'px'; pop.style.left = Math.max(8, r.left + window.scrollX - 80) + 'px';
			// close when clicking outside
			setTimeout(()=>{ window.addEventListener('click', function ondoc(e){ if (!pop.contains(e.target) && e.target !== anchor){ pop.remove(); window.removeEventListener('click', ondoc); } }, { once:false }); }, 50);
			return pop;
		}

		const fireBtn = document.getElementById('nav-fire');
		const trendingBtn = document.getElementById('nav-trending');

		// highlight active nav link based on current path
		function highlightActiveNav(){
			const links = document.querySelectorAll('.nav-links a.nav-link');
			const cur = window.location.pathname.replace(/\\/g, '/');
			links.forEach(a => {
				try{
					const hrefPath = new URL(a.href, window.location.origin).pathname;
					if (hrefPath === cur) a.classList.add('active'); else a.classList.remove('active');
				}catch(e){ }
			});
		}
		highlightActiveNav();

		fireBtn?.addEventListener('click', (e)=>{ if (e && e.preventDefault) e.preventDefault(); e.stopPropagation(); const html = '<strong>Trending</strong><div style="margin-top:8px;">Top posts and discoveries live here.</div><ul style="margin-top:8px; padding-left:16px;"><li>Feature 1</li><li>Feature 2</li></ul>'; createPopover(html, fireBtn); });
		trendingBtn?.addEventListener('click', (e)=>{ if (e && e.preventDefault) e.preventDefault(); e.stopPropagation(); const html = '<strong>Activity</strong><div style="margin-top:8px;">Your recent activity and notifications.</div><div style="margin-top:8px;"><em>(placeholder)</em></div>'; createPopover(html, trendingBtn); });
	}

	(async function(){ await initPosts(); renderAuth(); renderPosts(); setupTopRightButtons(); })();
});

/* Small CSS injection for active/hover states (keeps edits local) */
(function injectStyles(){
	const css = `
		.vote-up:hover, .vote-down:hover { color: #ffb3a7; transform: translateY(-2px); }
		.voted-disabled { opacity: 0.5; pointer-events: none; }
		.btn-new-post { margin-top: 12px; padding: 8px 10px; border-radius: 12px; background: #2b2b2b; color: #fff; border: 1px solid rgba(255,255,255,0.05); cursor: pointer; }
		.share-btn { cursor: pointer; color: #bbb; }
		.share-btn:hover { color: var(--orange); }
		#login-form input, #profile-edit input, #profile-edit textarea { width:100%; margin-bottom:8px; }
		#profile-summary { margin-top:8px; }
		.top-panel-popover { z-index: 3000; }
		.nav-links a.nav-link { color: inherit; text-decoration: none; display:inline-flex; align-items:center; gap:6px; padding:6px; }
		.nav-links a.nav-link.active { color: var(--orange); border-bottom:2px solid var(--orange); }
		.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
	`;
	const s = document.createElement('style'); s.textContent = css;
	document.head.appendChild(s);
})();

// --- Modal wiring for Google + local signup ---
document.addEventListener('DOMContentLoaded', () => {
	const loginModal = document.getElementById('login-modal');
	const googleBtn = document.getElementById('google-signin');
	const modalSignUp = document.getElementById('modal-signup');
	const modalSignIn = document.getElementById('modal-signin');
	const modalCancel = document.getElementById('modal-cancel');
	const modalPassword = document.getElementById('modal-password');

	function openModal(){ loginModal.style.display = 'flex'; }
	function closeModal(){ loginModal.style.display = 'none'; }

	// open modal helper used earlier when unauthenticated
	window.openAuthModal = openModal;

	// sidebar login button opens modal
	document.getElementById('open-login-btn')?.addEventListener('click', () => openModal());

	modalCancel?.addEventListener('click', () => closeModal());

	modalSignUp?.addEventListener('click', async () => {
		const username = (document.getElementById('modal-username')?.value || '').trim();
		const password = (modalPassword?.value || '').trim();
		if (!username || !password) { alert('Please enter username and password'); return; }
		// try server register first
		try {
			const res = await fetch('/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
			if (res.ok) {
				closeModal();
				await initPosts(); renderPosts(); renderAuth(); return;
			}
		} catch (e) {
			// fall through to local fallback
		}
		// local fallback
		const USERS_KEY = 'rb_users_v1'; const CURRENT_KEY = 'rb_current_user_v1';
		const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
		if (!users[username]) users[username] = { username, displayName: username, bio:'', votes:{}, joinedCommunity:false, passwordHash: null };
		localStorage.setItem(USERS_KEY, JSON.stringify(users));
		localStorage.setItem(CURRENT_KEY, username);
		closeModal(); renderAuth(); await initPosts(); renderPosts();
	});

	modalSignIn?.addEventListener('click', async () => {
		const username = (document.getElementById('modal-username')?.value || '').trim();
		const password = (modalPassword?.value || '').trim();
		if (!username || !password) { alert('Please enter username and password'); return; }
		try {
			const res = await fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
			if (res.ok) {
				closeModal(); await initPosts(); renderPosts(); renderAuth(); return;
			} else {
				const j = await res.json().catch(()=>({})); alert(j.error || 'Login failed'); return;
			}
		} catch (e) {
			// try local fallback: check localStorage users (no password validation)
			const users = JSON.parse(localStorage.getItem('rb_users_v1') || '{}');
			if (users[username] && !users[username].banned) {
				localStorage.setItem('rb_current_user_v1', username); closeModal(); renderAuth(); await initPosts(); renderPosts(); return;
			}
			alert('Login failed (server unreachable and no local account)');
		}
	});

	// (old local modal handler removed — using Sign up / Sign in handlers above)

	// GOOGLE OAUTH using Google Identity Services (ID token flow)
	// Using the provided client ID from the user
	const GOOGLE_CLIENT_ID = '857588084937-l64dtqgbqis8nml1gcrqcbsmbdo8en68.apps.googleusercontent.com';
	googleBtn?.addEventListener('click', () => {
		// load the Google Identity Services script if not already loaded
		function initGoogle() {
			if (!window.google || !window.google.accounts || !window.google.accounts.id) {
				console.warn('Google Identity script not loaded');
				return;
			}
			window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
			// prompt the One Tap / sign-in UI
			window.google.accounts.id.prompt();
		}

		function handleGoogleCredential(resp) {
			// resp.credential is an ID token (JWT). Send to server for verification and session creation.
			if (!resp || !resp.credential) { alert('Google sign-in failed'); return; }
			fetch('/auth/google/token', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id_token: resp.credential }) })
				.then(r => r.json())
				.then(j => {
					if (j && j.username) {
						// refresh client UI
						closeModal(); initPosts().then(()=>{ renderAuth(); renderPosts(); });
					} else {
						alert('Google sign-in failed');
					}
				}).catch(e => { console.warn(e); alert('Google sign-in failed'); });
		}

		if (window.google && window.google.accounts && window.google.accounts.id) initGoogle();
		else {
			const s = document.createElement('script');
			s.src = 'https://accounts.google.com/gsi/client';
			s.async = true; s.defer = true;
			s.onload = initGoogle;
			document.head.appendChild(s);
		}
	});
});

// Expose a helper the rest of the script uses to request login
function showLoginModal(){ if (window.openAuthModal) window.openAuthModal(); else alert('Please log in to continue.'); }
