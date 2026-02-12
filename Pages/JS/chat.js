document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const mainBody = document.getElementById('mainBody');
    const sendBtn = document.getElementById('sendBtn');
    const chatWindow = document.getElementById('chatWindow');
        const btnClear = document.getElementById('btn-clear');
        const btnCopy = document.getElementById('btn-copy');
        const modelSelect = document.getElementById('modelSelect');

    if (!userInput || !chatWindow) return;

    // helpers
    function autosize(t){
        t.style.height = 'auto';
        t.style.height = (t.scrollHeight) + 'px';
        if (t.scrollHeight > 150) { t.style.overflowY = 'scroll'; t.style.height = '150px'; } else { t.style.overflowY = 'hidden'; }
    }

    function appendMessage(text, cls){
        const el = document.createElement('div'); el.className = 'message ' + cls; el.textContent = text;
        chatWindow.appendChild(el); chatWindow.scrollTop = chatWindow.scrollHeight;
        return el;
    }

    function setThinking(on){
        if (on) {
            const t = document.createElement('div'); t.className = 'message ai thinking'; t.id = 'thinkingDots'; t.innerHTML = '<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
            chatWindow.appendChild(t); chatWindow.scrollTop = chatWindow.scrollHeight;
        } else {
            const t = document.getElementById('thinkingDots'); if (t) t.remove();
        }
    }

    // Manage hero hide while typing
    userInput.addEventListener('input', () => { mainBody.classList.toggle('is-typing', userInput.value.trim().length>0); autosize(userInput); });

    // Send function: calls server proxy then animates typing of reply
    async function send(){
        const raw = userInput.value || '';
        const text = raw.trim(); if (!text) return;
        appendMessage(text, 'user'); userInput.value = ''; autosize(userInput); mainBody.classList.remove('is-typing');

        // show thinking
        setThinking(true);
            try {
                const payload = { prompt: text };
                if (modelSelect && modelSelect.value) payload.model = modelSelect.value;
                const resp = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
            setThinking(false);
            if (!resp.ok) {
                const j = await resp.json().catch(()=>({})); appendMessage('Sorry, AI service is unavailable. ' + (j.error||''), 'ai'); return;
            }
            const j = await resp.json(); const out = j.text || j.result || JSON.stringify(j);

            // animate typing effect
            const replyEl = appendMessage('', 'ai');
            let i = 0;
            const speed = 18; // ms per char
            function step(){
                if (i <= out.length) { replyEl.textContent = out.slice(0,i); chatWindow.scrollTop = chatWindow.scrollHeight; i++; setTimeout(step, speed); }
            }
            step();
        } catch (e) {
            setThinking(false);
            appendMessage('Network error while contacting AI.', 'ai');
            console.error(e);
        }
    }

    sendBtn?.addEventListener('click', (e)=>{ e.preventDefault(); send(); });
    userInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); } });

        // Clear chat (keeps welcome message)
        btnClear?.addEventListener('click', (e)=>{
            e.preventDefault();
            const welcome = document.getElementById('welcomeMsg');
            chatWindow.innerHTML = '';
            if (welcome) chatWindow.appendChild(welcome);
            chatWindow.scrollTop = chatWindow.scrollHeight;
            userInput.focus();
        });

        // Copy conversation
        btnCopy?.addEventListener('click', async (e)=>{
            e.preventDefault();
            try {
                const texts = Array.from(chatWindow.querySelectorAll('.message')).map(m => m.textContent.trim()).filter(Boolean).join('\n\n');
                await navigator.clipboard.writeText(texts);
                // tiny feedback
                btnCopy.textContent = 'Copied'; setTimeout(()=>btnCopy.textContent = 'Copy', 1200);
            } catch (err) { console.warn('copy failed', err); alert('Copy failed'); }
        });
});