// ------------------- chatbot.js -------------------

document.addEventListener('DOMContentLoaded', () => {
  // === 0. HELPER: Strip out numbered follow-up questions from the LLM’s "text" ===
  function stripFollowupsFromText(payload) {
    let text = payload.text || "";
    const qlist = Array.isArray(payload.follow_up_questions)
      ? payload.follow_up_questions
      : [];

    if (!text || qlist.length === 0) {
      return text.trim();
    }

    // 1) Remove each "1. <question>" / "2. <question>" … form from the text
    qlist.forEach((q, idx) => {
      const questionNumber = idx + 1;
      const numberedForm = `${questionNumber}. ${q}`;
      // Escape regex-special characters
      const escaped = numberedForm.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      text = text.replace(new RegExp(escaped, "g"), "");
    });

    // 2) Remove any leftover lines that are just a number + "." (e.g. "1.")
    text = text.replace(/^\s*\d+\.\s*$/gm, "");

    // 3) Collapse 3+ consecutive newlines into exactly two newlines
    text = text.replace(/\n{3,}/g, "\n\n");

    // 4) Trim leading/trailing whitespace/newlines
    return text.trim();
  }

  // === 1. DEFINE BACKEND URL & THREAD ID ===
  const API_BASE_URL = 'https://triagecall.vercel.app';
  let threadId = null;

  // === 2. CACHE ALL DOM ELEMENTS ===
  const welcomeScreen = document.querySelector('.welcome-screen');
  const chatScreen = document.querySelector('.chat-screen');
  const firstAidScreen = document.querySelector('.first-aid-screen');

  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.querySelector('.sidebar-overlay');
  const sidebarToggleButton = document.querySelector('.sidebar-toggle-button');
  const closeSidebarButton = document.querySelector('.close-sidebar-button');
  const navItems = document.querySelectorAll('.nav-item');

  const symptomsHistoryScreen = document.querySelector('.symptoms-history-screen');
  const healthFactsScreen = document.querySelector('.health-facts-screen');
  const emergencyContactsScreen = document.querySelector('.emergency-contacts-screen');
  const settingsScreen = document.querySelector('.settings-screen');
  const allBackButtons = document.querySelectorAll('.app-screen .back-button');

  const startChatButton = document.getElementById('start-chat-button');
  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-button');
  const chatMessages = document.querySelector('.chat-messages');

  const loadingDiagnosis = document.querySelector('.loading-diagnosis');
  const diagnosisPanel = document.querySelector('.diagnosis-panel');
  const diagnosisPanelTitle = document.getElementById('diagnosis-panel-title');
  const urgentDiagnosisContent = document.getElementById('urgent-diagnosis-content');
  const analysisSummarySection = document.getElementById('analysis-summary-section');
  const confidenceScoreSection = document.getElementById('confidence-score-section');
  const nextStepsSection = document.getElementById('next-steps-section');

  const promptSuggestionArea = document.querySelector('.prompt-suggestion-area');
  const promptButtons = document.querySelectorAll('.prompt-button');
  const refreshPromptsButton = document.querySelector('.refresh-prompts-button');

  const closeDiagnosisPanelButton = document.getElementById('close-diagnosis-panel');
  const reopenPanelButton = document.getElementById('reopen-panel-button');
  const callEmergencyButton = document.getElementById('call-emergency-button');
  const performFirstAidButton = document.getElementById('perform-first-aid-button');

  // Track the currently active content screen
  let currentActiveContentScreen = welcomeScreen;

  // === 3. UTILITY: Show/hide different screens ===
  function showScreen(screenToShow, fromSidebar = false) {
    [
      welcomeScreen,
      chatScreen,
      firstAidScreen,
      symptomsHistoryScreen,
      healthFactsScreen,
      emergencyContactsScreen,
      settingsScreen
    ].forEach(screen => screen.classList.remove('active-screen'));

    screenToShow.classList.add('active-screen');
    currentActiveContentScreen = screenToShow;

    if (fromSidebar) {
      closeSidebar();
    }
  }

  // === 4. SIDEBAR OPEN/CLOSE ===
  function openSidebar() {
    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }

  // === 5. CHAT HELPERS ===
  // 5.1 Append a message bubble to the chat
  function addMessage(text, sender) {
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble', sender);
    messageBubble.textContent = text;
    chatMessages.appendChild(messageBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 5.2 Typing “…” indicator
  function simulateAiTyping() {
    const typingBubble = document.createElement('div');
    typingBubble.classList.add('message-bubble', 'ai', 'typing-indicator');
    typingBubble.innerHTML = '<span>.</span><span>.</span><span>.</span>';
    chatMessages.appendChild(typingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return typingBubble;
  }
  function removeTypingIndicator(indicator) {
    if (indicator && indicator.parentNode) {
      indicator.remove();
    }
  }

  // -------------------------------------------
  // === 6. FUNCTION TO CALL /triage ===
  // -------------------------------------------
  async function handleAiConversation(userMessage) {
    // 6.1 Show typing indicator
    const typingIndicator = simulateAiTyping();

    // 6.2 Build payload (include thread_id if present)
    const payload = { description: userMessage };
    if (threadId) {
      payload.thread_id = threadId;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      removeTypingIndicator(typingIndicator);

      if (!resp.ok) {
        addMessage("Sorry, something went wrong. Please try again later.", 'ai');
        return;
      }

      // 6.3 Save the returned thread_id
      threadId = data.thread_id;

      // 6.4 Strip out any numbered follow-up questions from data.text
      const cleanedText = stripFollowupsFromText(data);

      // 6.5 Render the cleaned “narrative” (if not empty)
      if (cleanedText) {
        addMessage(cleanedText, 'ai');
      }

      // 6.6 Render each follow-up question on its own line
      if (data.follow_up_questions && data.follow_up_questions.length > 0) {
        data.follow_up_questions.forEach(q => {
          addMessage("🔸 " + q, 'ai');
        });
      }

      // 6.7 If there are possible_conditions, show diagnosis panel
      if (data.possible_conditions && data.possible_conditions.length > 0) {
        renderDiagnosisPanel(data);
      }
      // 6.8 Otherwise, if send_sos is true, prompt emergency
      else if (data.send_sos) {
        addMessage("🚨 This sounds like an emergency. Please call your local emergency number immediately.", 'ai');
      }
    }
    catch (err) {
      removeTypingIndicator(typingIndicator);
      console.error('Error calling /triage:', err);
      addMessage("Network error. Please check your connection and try again.", 'ai');
    }
  }

  // -------------------------------------------
  // === 7. FUNCTION TO RENDER DIAGNOSIS PANEL ===
  // -------------------------------------------
  function renderDiagnosisPanel(responseData) {
    const isUrgent = responseData.send_sos || responseData.triage.type === 'hospital';

    if (isUrgent) {
      diagnosisPanel.classList.add('urgent');
      diagnosisPanelTitle.textContent = '🚨 Immediate Attention Required';
      urgentDiagnosisContent.style.display = 'flex';
      analysisSummarySection.style.display = 'none';
      confidenceScoreSection.style.display = 'none';
      nextStepsSection.style.display = 'none';
    } else {
      diagnosisPanel.classList.remove('urgent');
      diagnosisPanelTitle.textContent = 'Diagnosis Result';
      urgentDiagnosisContent.style.display = 'none';
      analysisSummarySection.style.display = 'block';
      confidenceScoreSection.style.display = 'block';
      nextStepsSection.style.display = 'block';

      // Populate “analysis-summary” with each condition’s name & description
      const analysisList = document.getElementById('analysis-summary-list');
      analysisList.innerHTML = '';
      responseData.possible_conditions.forEach((cond, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${idx + 1}. ${cond.name}:</strong> ${cond.description}`;
        analysisList.appendChild(li);
      });

      // Populate “next-steps” from safety_measures
      const nextStepsList = document.getElementById('next-steps-list');
      nextStepsList.innerHTML = '';
      responseData.safety_measures.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        nextStepsList.appendChild(li);
      });
    }

    // Always set “Likely:” to the first condition name if it exists
    if (responseData.possible_conditions.length > 0) {
      document.getElementById('diagnosis-condition').textContent =
        responseData.possible_conditions[0].name;
    } else {
      document.getElementById('diagnosis-condition').textContent = 'No conditions found';
    }

    // Set the triage badge (urgent / moderate / mild)
    const triageElem = document.getElementById('diagnosis-triage');
    let triageText = '', triageIndicator = '', triageClass = '';
    if (isUrgent) {
      triageText = 'Urgent (Call Emergency)';
      triageIndicator = '🟥';
      triageClass = 'triage-level urgent';
    } else if (responseData.triage.type === 'clinic') {
      triageText = 'Moderate (See doctor within 24 hrs)';
      triageIndicator = '🟡';
      triageClass = 'triage-level moderate';
    } else {
      triageText = 'Mild (Self-care)';
      triageIndicator = '🟢';
      triageClass = 'triage-level mild';
    }
    triageElem.className = triageClass;
    triageElem.innerHTML = `<span class="level-indicator">${triageIndicator}</span> ${triageText}`;

    // Finally, display the panel
    diagnosisPanel.style.display = 'flex';
    diagnosisPanel.classList.add('active');
    reopenPanelButton.style.display = 'none';
  }

  // -------------------------------------------
  // === 8. EVENT LISTENERS: “Start Chat,” “Send,” “Enter” key ===
  // -------------------------------------------
  startChatButton.addEventListener('click', () => {
    showScreen(chatScreen);
    promptSuggestionArea.style.display = 'flex';
    setTimeout(() => chatInput.focus(), 600);
    document.querySelector('.nav-item[data-target-screen="chat-screen"]').classList.add('active');
  });

  sendButton.addEventListener('click', () => {
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    // Hide the prompt suggestions on first send
    promptSuggestionArea.style.display = 'none';

    addMessage(userMessage, 'user');
    chatInput.value = '';

    // Before calling backend, hide any existing diagnosis panel
    diagnosisPanel.classList.remove('active', 'urgent');
    diagnosisPanel.style.display = 'none';
    reopenPanelButton.style.display = 'none';

    // Call our function
    handleAiConversation(userMessage);
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });

  chatInput.addEventListener('input', () => {
    if (chatInput.value.trim().length > 0) {
      promptSuggestionArea.style.display = 'none';
    } else {
      if (!diagnosisPanel.classList.contains('active')) {
        promptSuggestionArea.style.display = 'flex';
      }
    }
  });

  promptButtons.forEach(button => {
    button.addEventListener('click', () => {
      const promptText = button.dataset.prompt;
      chatInput.value = promptText;
      sendButton.click();
    });
  });
  refreshPromptsButton.addEventListener('click', () => {
    promptSuggestionArea.style.display = 'flex';
    chatInput.value = '';
  });

  // -------------------------------------------
  // === 9. CLOSE/REOPEN DIAGNOSIS PANEL ===
  // -------------------------------------------
  closeDiagnosisPanelButton.addEventListener('click', () => {
    diagnosisPanel.classList.remove('active');
    setTimeout(() => {
      diagnosisPanel.style.display = 'none';
      reopenPanelButton.style.display = 'flex';
      if (diagnosisPanel.classList.contains('urgent')) {
        reopenPanelButton.textContent = 'View Urgent Actions';
      } else {
        reopenPanelButton.textContent = 'View Diagnosis';
      }
    }, 300);
  });
  reopenPanelButton.addEventListener('click', () => {
    diagnosisPanel.style.display = 'flex';
    diagnosisPanel.classList.add('active');
    reopenPanelButton.style.display = 'none';
  });

  // -------------------------------------------
  // === 10. EMERGENCY / FIRST AID BUTTONS ===
  // -------------------------------------------
  callEmergencyButton.addEventListener('click', () => {
    alert('Calling emergency services...');
    window.location.href = 'tel:911';
  });
  performFirstAidButton.addEventListener('click', () => {
    showScreen(firstAidScreen);
  });
  document.querySelector('.first-aid-screen .back-button').addEventListener('click', () => {
    showScreen(chatScreen);
    if (diagnosisPanel.classList.contains('urgent')) {
      reopenPanelButton.textContent = 'View Urgent Actions';
      reopenPanelButton.style.display = 'flex';
    }
  });

  // -------------------------------------------
  // === 11. SIDEBAR TOGGLE & NAVIGATION ===
  // -------------------------------------------
  sidebarToggleButton.addEventListener('click', openSidebar);
  closeSidebarButton.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  navItems.forEach(item => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const targetScreenId = item.dataset.targetScreen;
      let targetScreen;
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      switch (targetScreenId) {
        case 'chat-screen':
          targetScreen = chatScreen;
          if (chatInput.value === '' && !diagnosisPanel.classList.contains('active')) {
            promptSuggestionArea.style.display = 'flex';
          }
          break;
        case 'symptoms-history-screen':
          targetScreen = symptomsHistoryScreen;
          break;
        case 'health-facts-screen':
          targetScreen = healthFactsScreen;
          break;
        case 'emergency-contacts-screen':
          targetScreen = emergencyContactsScreen;
          break;
        case 'settings-screen':
          targetScreen = settingsScreen;
          break;
        default:
          targetScreen = welcomeScreen;
      }
      showScreen(targetScreen, true);
    });
  });

  // -------------------------------------------
  // === 12. BACK BUTTONS FOR OTHER SCREENS ===
  // -------------------------------------------
  allBackButtons.forEach(button => {
    button.addEventListener('click', () => {
      showScreen(chatScreen);
      document.querySelector('.nav-item[data-target-screen="chat-screen"]').classList.add('active');
      navItems.forEach(nav => {
        if (nav.dataset.targetScreen !== 'chat-screen') {
          nav.classList.remove('active');
        }
      });
    });
  });

  // -------------------------------------------
  // === 13. INITIAL SETUP ===
  // -------------------------------------------
  showScreen(welcomeScreen);
});
// ------------------- End of chatbot.js -------------------
