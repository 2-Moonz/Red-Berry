// --- Dropdown/Menu Logic (from second JS block) ---

function toggleDropdown() {
  // Toggles the dropdown menu connected to the 3-dot icon in the navbar
  document.getElementById("dropdownMenu").classList.toggle("show");
  // Close the tools dropdown too, just in case
  const toolsDropdown = document.getElementById("toolsDropdownMenu");
  if (toolsDropdown) toolsDropdown.classList.remove("show");
}

// Function to toggle the Tools dropdown menu in the content panel
function toggleToolsDropdown() {
  document.getElementById("toolsDropdownMenu").classList.toggle("show");
  // Close the main navbar dropdown too, just in case
  const chatDropdown = document.getElementById("dropdownMenu");
  if (chatDropdown) chatDropdown.classList.remove("show");
}

function toggleEdit() {
  const content = document.getElementById("editableContent");
  const isEditable = content.getAttribute('contenteditable') === 'true';

  if (isEditable) {
    content.setAttribute('contenteditable', 'false');
  } else {
    content.setAttribute('contenteditable', 'true');
    content.focus();
  }

  // Close the tools dropdown after selecting "Edit Content"
  const toolsDropdown = document.getElementById("toolsDropdownMenu");
  if (toolsDropdown) toolsDropdown.classList.remove("show");
  return false; // Prevent default anchor link behavior
}

// Global click handler to close BOTH dropdowns if clicked outside
window.onclick = function(event) {
  // Chat Header Dropdown (now in Navbar)
  const chatDropdown = document.getElementById("dropdownMenu");
  if (chatDropdown && chatDropdown.classList.contains('show') && !event.target.closest('.menu-container') && !event.target.closest('.dropdown-content a')) {
    chatDropdown.classList.remove('show');
  }

  // Content Panel Tools Dropdown
  const toolsDropdown = document.getElementById("toolsDropdownMenu");
  if (toolsDropdown && toolsDropdown.classList.contains('show') && !event.target.closest('.tool-container') && !event.target.closest('.tools-dropdown-content a')) {
    toolsDropdown.classList.remove('show');
  }
}

// --- Chat/API Logic (from first JS block) ---

const API_KEY = "Token-Here"; // Leave as empty string for Canvas environment
const API_MODEL = "gemini-2.5-flash-preview-09-2025";
let MAX_RETRIES = 5;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${API_KEY}`;

const inputData = document.querySelector(".chat-input input");
// Check if inputData exists before continuing with the chat logic
if (inputData) {
  
  let userMsgCount = 0;
  let botMsgCount = 0;
  const appData = {
    userMessages: [],
    botMessages: [],
  };
  
  // NOTE: geminiPrompt object remains here for context; updated to a student tutor specification
  const geminiPrompt = {
    name: "BlueBerryTutorSpec",
    version: "1.0.0",
    purpose: "Student-focused tutor assistant that explains concepts clearly and generates short practice quizzes with runnable sample code to help students prepare for exams.",
    language_policy: { respond_in_users_language: true },
    output_structure: {
      paragraph_1: {
        type: "natural_language",
        constraints: [
          "Concise explanation or guidance",
          "Step-by-step solutions when relevant",
          "Ask clarifying questions if the user's request is ambiguous",
        ],
      },
      paragraph_2: {
        type: "html_code_quiz",
        render_condition: "Produce ONLY when the user requests a practice quiz, exam prep, or runnable sample",
        constraints: [
          "Contains ONLY a single HTML fragment (no <head> or <body>)",
          "Root element must be <div id='quiz-app'>",
          "Include minimal inline CSS/JS required to run the quiz client-side",
          "Precede the HTML fragment with a single HTML comment containing a JSON object labeled 'answers' with correct answers",
          "Do not include additional explanatory text outside Paragraph 1",
        ],
      },
      termination: { rule: "If Paragraph 2 is produced, output MUST terminate immediately after the HTML fragment and answers comment." },
    },
    intent_detection: {
      actions: {
        EXPLAIN: "Explain a concept or solve a problem step-by-step.",
        QUIZ: "Generate a short practice quiz (3-8 questions) and provide answers in JSON plus a runnable HTML/JS sample.",
        SUMMARY: "Summarize a topic or provide quick notes for revision.",
        CODE_EXAMPLE: "Provide a small runnable code snippet demonstrating the concept.",
      },
      notes: ["When QUIZ is requested include correct answers in a JSON block in the top HTML comment.", "Favor clarity and avoid unnecessary jargon."]
    },
    quiz_metadata: {
      defaults: { num_questions: 5, difficulty: "medium", topics: [] },
      question_formats: ["multiple_choice", "short_answer"],
      answer_block: { format: "json", label: "answers", location: "top_html_comment" },
      // Request a large runnable sample when producing quiz HTML. This suggests the AI include
      // at least 400 lines of code (HTML/CSS/JS and comments). The model may still be limited
      // by the API token limits; if truncated, it should mark truncation clearly.
      min_lines_of_code: 400
    },
    safety_consistency: {
      privacy: "Do not include personal data beyond what the user provided.",
      no_hallucination: true,
      citations: "When factual claims are made, suggest reliable sources or how to verify.",
    },
    examples: [
      { user: "Explain photosynthesis.", assistant_paragraph_1: "A clear explanation of the photosynthesis process..." },
      { user: "Create a 5-question quiz on basic algebra and provide a runnable quiz sample.", assistant_paragraph_1: "Here is a short 5-question quiz on algebra.", assistant_paragraph_2: "<!-- {\"answers\": {\"1\": \"B\", ... } } -->\n<div id='quiz-app'>...quiz html/js...</div>" }
    ]
  };
  
  //to send message
  const sendMessage = (e) => {
    // Prevent default form submission if it's an event (like enter keypress)
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    // Use inputData.value directly since it's defined above
    if (inputData.value.trim()) {
      const msg = {
        author: "user",
        message: inputData.value,
        msgId: userMsgCount,
      };
      appData.userMessages.push(msg);
      userMsgCount += 1;
      
      const messagesContainer = document.querySelector(".chat-panel .messages");
      
      // Append user message
      messagesContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="message sent">${inputData.value}</div>`
      );
      
      // Scroll to bottom to show new message
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      generateResponse();
      inputData.value = "";
      // Return focus to the input for quick follow-up
      try { inputData.focus(); } catch (err) {}
    }
  };
  
  // Attach sendMessage to the button's onclick (already done in HTML, but good practice to have a listener)
  const sendButton = document.querySelector(".chat-input button");
  if (sendButton) {
      // If the button is clicked, we call sendMessage, passing a dummy event to prevent errors
      sendButton.addEventListener('click', (e) => sendMessage(e));
  }
  
  //genereate response from API gemini
  const generateResponse = async () => {
    const messagesContainer = document.querySelector(".chat-panel .messages");
    
    const typingIndicatorHTML = `
      <div class="message received" id="typing-indicator">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>`;
    
    // Insert typing indicator
    messagesContainer.insertAdjacentHTML("beforeend", typingIndicatorHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to indicator
    
    // Construct request options (Contents will be the last 10 messages + the prompt spec)
    const history = [...appData.userMessages, ...appData.botMessages]
                                .sort((a, b) => a.msgId - b.msgId) // Sort by ID
                                .slice(-10) // Keep last 10 messages
                                .map(msg => ({
                                    role: msg.author === 'user' ? 'user' : 'model',
                                    parts: [{ text: msg.message }]
                                }));
    
    // Add the system instruction at the start of the contents array
    const contents = [
        {
            role: "user",
            parts: [{ text: JSON.stringify(geminiPrompt) }],
        },
        ...history
    ];
    
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: contents, // Use the structured history
      }),
    };
    
    let typingIndicatorElement;
    
    try {
      const response = await fetch(API_URL, requestOptions);
      const data = await response.json();
      
      if (!response.ok || !data.candidates || data.candidates.length === 0) {
        throw new Error(
          `API Error: ${response.status} ${response.statusText} - ${data.error ? data.error.message : 'No candidate found'}`
        );
      }
      
      console.log(data);
      const botAnswer = data.candidates[0].content.parts[0].text;
      
      const msg = {
        author: "bot",
        message: botAnswer,
        msgId: botMsgCount,
      };
      appData.botMessages.push(msg);
      botMsgCount += 1;
      
      const Contents = splitStringByParagraph(botAnswer);
      
      // Append the plain text response
      messagesContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="message received">${Contents.plainText}</div>`
      );
      
      console.log("Extracted HTML Content:", Contents.htmlString);
      
      // Check for and render HTML content
      if (Contents.htmlString) {
        // Since the HTML now uses the ID 'editableContent' inside 'content-panel',
        // we should only update the inner content.
        const contentPanel = document.getElementById("editableContent");
        
        if (contentPanel) {
            contentPanel.innerHTML = Contents.htmlString;
            contentPanel.setAttribute('contenteditable', 'false'); // Reset edit state
            // Ensure injected HTML is viewable — make content panel scroll to bottom
            try {
              contentPanel.style.overflowY = 'auto';
              contentPanel.scrollTop = contentPanel.scrollHeight;
            } catch (err) {
              console.warn('Could not auto-scroll content panel:', err);
            }
        } else {
             // Fallback to updating the whole content panel if structure changes
            document.querySelector(".content-panel").innerHTML =
                Contents.htmlString || "<p>No calendar HTML generated.</p>";
        }
      } else if (Contents.plainText) {
          // If no new HTML, and a new text response, just ensure the editableContent has the default text
          const contentPanel = document.getElementById("editableContent");
          if (contentPanel && contentPanel.innerHTML.includes("Responses or other content will appear here.")) {
              // Optionally clear it, or keep it as is if its not intended to be cleared with every text message
          }
      }
      
    } catch (error) {
      const errorMessage = `<div class="error-message message received" role="alert" style="background: #a94442; color: white;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.91.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.09 5.995C7.046 5.462 7.465 5 8 5m0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/>
        </svg>
        <p><strong>Error:</strong> ${error.message}</p>
      </div>`;
      messagesContainer.insertAdjacentHTML("beforeend", errorMessage);
    } finally {
      // Remove typing indicator in all cases
      typingIndicatorElement = document.getElementById("typing-indicator");
      if (typingIndicatorElement) {
        typingIndicatorElement.remove();
      }
      // Ensure messages are scrolled to the bottom after all updates
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };
  
  const splitStringByParagraph = (fullString) => {
    // Splits by two or more newlines, which should separate P1 (text) and P2 (HTML)
    const separatorPattern = /\r?\n\s*\r?\n/;
    const parts = fullString.split(separatorPattern);
    
    // Paragraph 1 is the first part
    const paragraph1 = parts[0] ? parts[0].trim() : "";
    
    // HTML code is everything after the first split, joined back by a space/newline
    const htmlCode = parts.slice(1).join("\n\n").trim();
    
    return {
      plainText: paragraph1,
      htmlString: htmlCode,
    };
  };
  
  //listen for enter key press
  inputData.addEventListener("keypress", function (e) {
    const userMessage = e.target.value.trim();
    if (e.key === "Enter" && userMessage) {
      sendMessage(e);
    }
  });

  // Support Ctrl+Enter to send and Esc to blur the input
  inputData.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const userMessage = e.target.value.trim();
      if (userMessage) {
        sendMessage(e);
      }
    } else if (e.key === 'Escape') {
      e.target.blur();
    }
  });

  // Copy content of the editable panel to clipboard
  window.copyContent = async function copyContent() {
    const contentPanel = document.getElementById('editableContent');
    if (!contentPanel) return;
    const text = contentPanel.innerText || contentPanel.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      // Visual feedback: temporarily change button text/title
      const btn = document.getElementById('btn-copy');
      if (btn) {
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = old, 1200);
      }
    } catch (err) {
      console.warn('Copy failed, trying fallback', err);
      // Fallback: create textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
  };

  // Clear chat messages and reset editable content
  window.clearChat = function clearChat() {
    const messagesContainer = document.querySelector('.chat-panel .messages');
    if (messagesContainer) messagesContainer.innerHTML = '';
    const contentPanel = document.getElementById('editableContent');
    if (contentPanel) contentPanel.innerHTML = '<p>Responses or other content will appear here.</p>';
    // Reset appData
    appData.userMessages = [];
    appData.botMessages = [];
    // Focus the input for a new conversation
    try { inputData.focus(); } catch (err) {}
  };
} else {
    console.error("Chat input element not found. Chat functionality disabled.");
}