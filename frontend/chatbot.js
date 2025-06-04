// ------------------- chatbot.js -------------------

document.addEventListener('DOMContentLoaded', () => {
  // === 1. NEW: Define the backend base URL & threadId ===
  const API_BASE_URL = 'https://triagecall.vercel.app';
  let threadId = null;

  // === 2. Cache all DOM elements ===
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

  // === Utility: Show/hide screens ===
  function showScreen(screenToShow, fromSidebar = false) {
    [welcomeScreen, chatScreen, firstAidScreen, symptomsHistoryScreen, healthFactsScreen, emergencyContactsScreen, settingsScreen]
      .forEach(screen => screen.classList.remove('active-screen'));

    screenToShow.classList.add('active-screen');
    currentActiveContentScreen = screenToShow;

    if (fromSidebar) {
      closeSidebar();
    }
  }

  // === Sidebar open/close ===
  function openSidebar() {
    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }

  // === Chat helper: append a message bubble ===
  function addMessage(text, sender) {
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble', sender);
    messageBubble.textContent = text;
    chatMessages.appendChild(messageBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // === Chat helper: typing “…” indicator ===
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
  // === 3. NEW: function to call /triage ===
  // -------------------------------------------
  async function handleAiConversation(userMessage) {
    // Add typing indicator
    const typingIndicator = simulateAiTyping();

    // Build payload (with optional thread_id)
    const payload = { description: userMessage };
    if (threadId) payload.thread_id = threadId;

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

      // Save the returned thread_id
      threadId = data.thread_id;

      // Render AI’s “text” in chat:
      addMessage(data.text.trim(), 'ai');

      // If we have possible_conditions, show diagnosis panel:
      if (data.possible_conditions && data.possible_conditions.length > 0) {
        renderDiagnosisPanel(data);
      }
      // Otherwise, if there are follow_up_questions, list them:
      else if (data.follow_up_questions && data.follow_up_questions.length > 0) {
        data.follow_up_questions.forEach(q => {
          addMessage("🔸 " + q, 'ai');
        });
      }

      // If send_sos is true and no conditions were shown, add an emergency prompt
      if (data.send_sos && (!data.possible_conditions || data.possible_conditions.length === 0)) {
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
  // === 4. NEW: renderDiagnosisPanel(data) ===
  // -------------------------------------------
  function renderDiagnosisPanel(responseData) {
    const isUrgent = responseData.send_sos || responseData.triage.type === 'hospital';

    // 1) Always set “Likely:” to the first condition name if it exists
    const primaryElement = document.getElementById('diagnosis-condition');
    if (responseData.possible_conditions.length > 0) {
      primaryElement.textContent = responseData.possible_conditions[0].name;
    } else {
      primaryElement.textContent = 'No conditions found';
    }

    // 2) Configure the triage badge
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

    // 3) Show/hide the urgent block
    if (isUrgent) {
      diagnosisPanel.classList.add('urgent');
      diagnosisPanelTitle.textContent = '🚨 Immediate Attention Required';
      urgentDiagnosisContent.style.display = 'flex';
    } else {
      diagnosisPanel.classList.remove('urgent');
      diagnosisPanelTitle.textContent = 'Diagnosis Result';
      urgentDiagnosisContent.style.display = 'none';
    }

    // 4) Populate Analysis Summary (always visible, even if urgent)
    const analysisList = document.getElementById('analysis-summary-list');
    analysisList.innerHTML = '';
    responseData.possible_conditions.forEach((cond, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${idx + 1}. ${cond.name}:</strong> ${cond.description}`;
      analysisList.appendChild(li);
    });
    analysisSummarySection.style.display = 'block';

    // 5) Populate Next Steps (always visible)
    const nextStepsList = document.getElementById('next-steps-list');
    nextStepsList.innerHTML = '';
    responseData.safety_measures.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      nextStepsList.appendChild(li);
    });
    nextStepsSection.style.display = 'block';

    // 6) Show confidence‐score (or you can hide if you prefer)
    confidenceScoreSection.style.display = 'block';

    // 7) Reveal the panel and hide the reopen button
    diagnosisPanel.style.display = 'flex';
    diagnosisPanel.classList.add('active');
    reopenPanelButton.style.display = 'none';
  }

  // -------------------------------------------
  // 5. Event Listeners: “Start Chat,” “Send,” “Enter” key
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

    // Hide prompt suggestions on first send
    promptSuggestionArea.style.display = 'none';

    addMessage(userMessage, 'user');
    chatInput.value = '';

    // Hide any existing diagnosis panel before new request
    diagnosisPanel.classList.remove('active', 'urgent');
    diagnosisPanel.style.display = 'none';
    reopenPanelButton.style.display = 'none';

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
  // 6. Close/Reopen Diagnosis Panel
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
  // 7. Emergency / First Aid Buttons
  // -------------------------------------------
  callEmergencyButton.addEventListener('click', () => {
    alert('Calling emergency services...');
    window.location.href = 'tel:112'; // Or whatever local emergency number
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
  // 8. Sidebar Toggle & Navigation
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
  // 9. Back Buttons for Other Screens
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
  // 10. Initial Setup
  // -------------------------------------------
  showScreen(welcomeScreen);
});
// ------------------- End of chatbot.js -------------------
