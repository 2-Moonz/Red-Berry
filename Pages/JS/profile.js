document.addEventListener('DOMContentLoaded', () => {
    const USERS_KEY = 'rb_users_v1';
    const CURRENT_KEY = 'rb_current_user_v1';
    const COMM_KEY = 'rb_communities_v1';
    const POSTS_KEY = 'rb_posts_v1';

    function loadUsers(){ try{return JSON.parse(localStorage.getItem(USERS_KEY) || '{}')}catch(e){return{}} }
    function saveUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
    function getCurrentUsername(){ return localStorage.getItem(CURRENT_KEY); }

    const username = getCurrentUsername();
    if (!username) {
        alert('You must be signed in to edit your profile.');
        window.location.href = '/Pages/red-berry.html';
        return;
    }

    const users = loadUsers();
    const user = users[username] || { username, displayName: username, bio:'', avatar: null };

    function loadCommunities(){ try{return JSON.parse(localStorage.getItem(COMM_KEY) || '[]')}catch(e){return[]} }
    function saveCommunities(c){ localStorage.setItem(COMM_KEY, JSON.stringify(c)); }
    function loadPosts(){ try{return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]')}catch(e){return[]} }
    function savePosts(p){ localStorage.setItem(POSTS_KEY, JSON.stringify(p)); }

    const avatarImg = document.getElementById('profile-avatar');
    const avatarFile = document.getElementById('avatar-file');
    const displayInput = document.getElementById('profile-display');
    const bioInput = document.getElementById('profile-bio');
    const userEl = document.getElementById('profile-username');

    userEl.textContent = user.username;
    displayInput.value = user.displayName || '';
    bioInput.value = user.bio || '';
    if (user.avatar) avatarImg.src = user.avatar; else avatarImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect fill='%232b2b2b' width='100%' height='100%'/><text x='50%' y='50%' fill='%23ffffff' font-size='48' text-anchor='middle' dy='.35em'>?</text></svg>";

    // preview selected image as data URL
    avatarFile.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { avatarImg.src = reader.result; avatarImg.dataset.preview = reader.result; };
        reader.readAsDataURL(f);
    });

    document.getElementById('save-profile').addEventListener('click', async () => {
        user.displayName = displayInput.value || user.username;
        user.bio = bioInput.value || '';
        if (avatarImg.dataset.preview) user.avatar = avatarImg.dataset.preview;
        users[username] = user; saveUsers(users);
        // try to update server
        try {
            await fetch('/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(user) });
        } catch (e) { /* ignore server errors */ }
        alert('Profile saved.');
        window.location.href = '/Pages/red-berry.html';
    });

    document.getElementById('sign-out').addEventListener('click', () => {
        localStorage.removeItem(CURRENT_KEY);
        window.location.href = '/Pages/red-berry.html';
    });

    // render user's communities
    function renderCommunityLists(){
        const comms = loadCommunities();
        const joinedEl = document.getElementById('joined-list');
        const ownedEl = document.getElementById('owned-list');
        if (!joinedEl || !ownedEl) return;
        joinedEl.innerHTML = '';
        ownedEl.innerHTML = '';
        const userComms = user.communities || [];
        comms.forEach(c=>{
            if (userComms.includes(c.id)){
                const div = document.createElement('div'); div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center';
                div.innerHTML = `<div style="color:#ddd">${c.name}</div>`;
                const btn = document.createElement('button'); btn.className='btn-join'; btn.textContent='Leave'; btn.addEventListener('click', ()=>{
                    user.communities = (user.communities||[]).filter(x=>x!==c.id); users[username]=user; saveUsers(users); renderCommunityLists();
                });
                div.appendChild(btn); joinedEl.appendChild(div);
            }
            if (c.owner === username){
                const div = document.createElement('div'); div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center';
                div.innerHTML = `<div style="color:#ddd">${c.name}</div>`;
                const btn = document.createElement('button'); btn.className='btn-join'; btn.textContent='Delete'; btn.addEventListener('click', ()=>{
                    if (!confirm('Delete community and its posts?')) return;
                    const all = loadCommunities(); const idx = all.findIndex(x=>x.id===c.id); if (idx>=0) all.splice(idx,1); saveCommunities(all);
                    // remove posts in that community
                    const posts = loadPosts(); const remaining = posts.filter(p=>p.communityId !== c.id); savePosts(remaining);
                    renderCommunityLists(); alert('Community deleted');
                });
                div.appendChild(btn); ownedEl.appendChild(div);
            }
        });
    }

    renderCommunityLists();
});
