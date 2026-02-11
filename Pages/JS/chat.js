// Lightweight client-only chat interactions for Pages/chat.html
// - autosize textarea
// - toggle `.is-typing` on body while typing
// - append user messages to chat window and a mock AI reply

(function(){
  const textarea = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatWindow = document.getElementById('chatWindow');
  const body = document.body;

  if (!textarea || !sendBtn || !chatWindow) return; // safe-guard

  // autosize textarea (simple)
  function autosize(t){
    t.style.height = 'auto';
    t.style.height = (t.scrollHeight) + 'px';
  }

  textarea.addEventListener('input', (e)=>{
    autosize(textarea);
    const hasText = textarea.value.trim().length > 0;
    body.classList.toggle('is-typing', hasText);
  });

  // send message
  function appendMessage(text, cls){
    const el = document.createElement('div');
    el.className = 'message ' + cls;
    el.textContent = text;
    chatWindow.appendChild(el);
    // scroll to bottom
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  async function send(){
    const raw = textarea.value || '';
    const value = raw.trim();
    if (!value) return;
    appendMessage(value, 'user');
    textarea.value = '';
    autosize(textarea);
    body.classList.remove('is-typing');

    // mock AI reply (client-only) with small delay
    appendMessage('...', 'ai');
    const last = Array.from(chatWindow.querySelectorAll('.message')).pop();
    await new Promise(r => setTimeout(r, 700 + Math.random()*600));
    if (last) last.textContent = 'Nice question — this demo echoes: ' + value;
  }

  sendBtn.addEventListener('click', (e)=>{ e.preventDefault(); send(); });

  textarea.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      send();
    }
  });

  // initial autosize
  autosize(textarea);
})();
