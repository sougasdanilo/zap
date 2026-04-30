const state = {
  sessionId: null,
  chats: [],
  activeJid: null,
  activeMessages: [],
  activeMessagesSignature: "",
  selectedMessageId: "",
  historyRefreshInterval: null,
  connectionInterval: null,
  mediaCache: new Map(),
  pendingMedia: new Set(),
  currentUser: null,
  currentTenant: null,
  accessToken: null,
};

function clearAuth() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    throw new Error('Token refresh indisponivel');
  }

  const refreshResponse = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  if (!refreshResponse.ok) {
    throw new Error('Token refresh failed');
  }

  const refreshData = await refreshResponse.json();
  localStorage.setItem('accessToken', refreshData.tokens.accessToken);
  localStorage.setItem('refreshToken', refreshData.tokens.refreshToken);
  state.accessToken = refreshData.tokens.accessToken;
}

// Logout function
async function logout() {
  clearAuth();
  window.location.href = '/auth';
}

function hasPermission(permission) {
  return Array.isArray(state.currentUser?.permissions) && state.currentUser.permissions.includes(permission);
}

function updateIdentityLabels(sessionId = state.sessionId) {
  const displayName =
    state.currentUser?.fullName ||
    state.currentUser?.username ||
    'Usuario';
  const role = state.currentUser?.role || 'collaborator';
  const roleLabels = {
    owner: 'Proprietario',
    admin: 'Administrador',
    collaborator: 'Colaborador',
  };

  elements.sessionLabel.textContent = `${displayName} · ${roleLabels[role] || role}`;
  elements.tenantLabel.textContent = state.currentTenant
    ? `${state.currentTenant.name} · Sessao ${sessionId || state.currentTenant.sessionId}`
    : `Sessao ${sessionId || '-'}`;
  elements.sessionLabel.classList.remove('hidden');
  elements.tenantLabel.classList.remove('hidden');
}

// Check authentication
async function checkAuthentication() {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const userStr = localStorage.getItem('user');

  if (!accessToken || !refreshToken || !userStr) {
    window.location.href = '/auth';
    return;
  }

  try {
    // Verify token is still valid
    const response = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        await refreshAccessToken();
      } else {
        throw new Error('Authentication failed');
      }
    } else {
      state.accessToken = accessToken;
    }

    // Get user data
    const userResponse = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${state.accessToken}`
      }
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      state.currentUser = userData.user;
      state.currentTenant = userData.tenant;
    }

  } catch (error) {
    console.error('Authentication error:', error);
    // Clear auth and redirect to login
    clearAuth();
    window.location.href = '/auth';
  }
}

const elements = {
  connectScreen: document.getElementById("connect-screen"),
  appShell: document.getElementById("app-shell"),
  connectBtn: document.getElementById("connect-btn"),
  connectionDot: document.getElementById("connection-dot"),
  connectionStatus: document.getElementById("connection-status"),
  qrWrapper: document.getElementById("qr-wrapper"),
  qrImage: document.getElementById("qr-image"),
  sessionLabel: document.getElementById("session-label"),
  tenantLabel: document.getElementById("tenant-label"),
  connectionPill: document.getElementById("connection-pill"),
  chatSearchInput: document.getElementById("chat-search-input"),
  chatList: document.getElementById("chat-list"),
  chatHeaderTitle: document.getElementById("chat-header-title"),
  chatHeaderSubtitle: document.getElementById("chat-header-subtitle"),
  chatProfilePicture: document.getElementById("chat-profile-picture"),
  messageList: document.getElementById("message-list"),
  messageComposer: document.getElementById("message-composer"),
  messageInput: document.getElementById("message-input"),
  emojiBtn: document.getElementById("emoji-btn"),
  attachBtn: document.getElementById("attach-btn"),
  voiceBtn: document.getElementById("voice-btn"),
  sendBtn: document.getElementById("send-btn"),
  businessToggleBtn: document.getElementById("business-toggle-btn"),
  aiConfigBtn: document.getElementById("ai-config-btn"),
  aiToggleBtn: document.getElementById("ai-toggle-btn"),
  teamBtn: document.getElementById("team-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  // Hidden inputs
  jidInput: document.getElementById("jid-input"),
  messageType: document.getElementById("message-type"),
  mediaUrlInput: document.getElementById("media-url-input"),
  mimeInput: document.getElementById("mime-input"),
  fileNameInput: document.getElementById("file-name-input"),
  reactionMessageId: document.getElementById("reaction-message-id"),
  reactionEmoji: document.getElementById("reaction-emoji"),
  interactiveJson: document.getElementById("interactive-json"),
    // Menus
  attachMenu: document.getElementById("attach-menu"),
  emojiPicker: document.getElementById("emoji-picker"),
  voiceRecorder: document.getElementById("voice-recorder"),
  businessOptions: document.getElementById("business-options"),
  // AI Config Modal
  aiConfigModal: document.getElementById("ai-config-modal"),
  closeAiConfigBtn: document.getElementById("close-ai-config-btn"),
  saveAiConfigBtn: document.getElementById("save-ai-config-btn"),
  cancelAiConfigBtn: document.getElementById("cancel-ai-config-btn"),
  testGoogleAiBtn: document.getElementById("test-google-ai-btn"),
  configStatus: document.getElementById("config-status"),
  // AI Config inputs
  aiProviderRadios: document.querySelectorAll('input[name="ai-provider"]'),
  googleAiConfig: document.getElementById("google-ai-config"),
  googleAiApiKey: document.getElementById("google-ai-api-key"),
  googleAiModel: document.getElementById("google-ai-model"),
  googleAiTemperature: document.getElementById("google-ai-temperature"),
  googleAiMaxTokens: document.getElementById("google-ai-max-tokens"),
  systemPrompt: document.getElementById("system-prompt"),
  maxHistoryLength: document.getElementById("max-history-length"),
  // Group Settings
  groupAiEnabled: document.getElementById("group-ai-enabled"),
  groupOptions: document.getElementById("group-options"),
  respondToMentions: document.getElementById("respond-to-mentions"),
  respondToCommands: document.getElementById("respond-to-commands"),
  commandPrefix: document.getElementById("command-prefix"),
  // Test Chat elements
  testChatMessages: document.getElementById("test-chat-messages"),
  testChatInput: document.getElementById("test-chat-input"),
  testChatSendBtn: document.getElementById("test-chat-send-btn"),
  // Attach options
  closeAttachBtn: document.getElementById("close-attach-btn"),
  attachImageBtn: document.getElementById("attach-image-btn"),
  attachVideoBtn: document.getElementById("attach-video-btn"),
  attachDocumentBtn: document.getElementById("attach-document-btn"),
  attachAudioBtn: document.getElementById("attach-audio-btn"),
  imageFileInput: document.getElementById("image-file-input"),
  videoFileInput: document.getElementById("video-file-input"),
  documentFileInput: document.getElementById("document-file-input"),
  audioFileInput: document.getElementById("audio-file-input"),
  // Emoji picker
  closeEmojiBtn: document.getElementById("close-emoji-btn"),
  emojiGrid: document.getElementById("emoji-grid"),
  // Voice recorder
  cancelVoiceBtn: document.getElementById("cancel-voice-btn"),
  sendVoiceBtn: document.getElementById("send-voice-btn"),
  voiceTimer: document.querySelector(".voice-timer"),
  // Business options
  closeBusinessBtn: document.getElementById("close-business-btn"),
  interactiveBtn: document.getElementById("interactive-btn"),
  listBtn: document.getElementById("list-btn"),
  locationBtn: document.getElementById("location-btn"),
  productBtn: document.getElementById("product-btn"),
};

const connectionLabels = {
  idle: "Aguardando",
  qr: "QR pronto",
  connecting: "Conectando",
  connected: "Online",
  closed: "Encerrada",
};

// Emoji data
const emojiCategories = {
  recent: ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤭"],
  smile: ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐"],
  people: ["👋", "🤚", "🖐", "✋", "🖖", "👌", "🤌", "🤏", "✌", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "🤝", "🧱", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁", "👅", "👄"],
  animals: ["🐵", "🙈", "🙉", "🙊", "🐒", "🐕", "🐕‍🦺", "🐩", "🐈", "🐈‍⬛", "🐈‍⬛", "🦫", "🐅", "🐆", "🐴", "🐎", "🦄", "🦓", "🦌", "🦬", "🐮", "🐂", "🐃", "🐄", "🐷", "🐖", "🐗", "🐽", "🐏", "🐑", "🐐", "🐪", "🐫", "🦙", "🦒", "🐘", "🦣", "🦏", "🦛", "🐭", "🐁", "🐀", "🐹", "🐰", "🐇", "🦫", "🦔", "🦇", "🐻", "🐻‍❄️", "🐨", "🐼", "🦥", "🦦", "🦨", "🦘", "🦡", "🐾", "🦃", "🐔", "🐓", "🐣", "🐤", "🐥", "🐦", "🐧", "🕊", "🦅", "🦆", "🦢", "🦉", "🤪", "🦚", "🦜"],
  food: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🍯", "🥞", "🧇", "🥚", "🍳", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "☕", "🫖", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉", "🧊", "🥢", "🍽", "🍴", "🥄"],
  activities: ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸", "🥌", "🎿", "⛷", "🏂", "🪂", "🏋️", "🤼", "🤸", "🤺", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚴", "🚵", "🎪", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🪗", "🎸", "🪕", "🎻", "🪈", "🎲", "♟", "🎯", "🎳", "🎮", "🎰", "🧩"],
  travel: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🏍", "🛵", "🚲", "🛴", "🛹", "🛼", "🚁", "🛸", "✈", "🛩", "🪂", "🚀", "🛰", "🚡", "🚠", "🚟", "🚋", "🚊", "🚉", "🚈", "🚇", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚃", "🚋", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎", "🏍", "🛵", "🦽", "🦼", "🛺", "🚲", "🛴", "🛹", "🛼", "🚁", "🛸", "✈", "🛩", "🪂", "🚀", "🛰", "🚡", "🚠", "🚟", "🚋", "🚊", "🚉", "🚈", "🚇", "🚝", "🚞", "🚋", "🚌", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎", "🏍", "🛵", "🦽", "🦼", "🛺", "🚲", "🛴", "🛹", "🛼", "🚁", "🛸", "✈", "🛩", "🪂", "🚀", "🛰", "🚡", "🚠", "🚟", "🚋", "🚊", "🚉", "🚈", "🚇", "🚝", "🚞", "🚟", "🚋", "🚌", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎", "🏍", "🛵", "🦽", "🦼", "🛺", "⚓", "⛵", "🛶", "🚤", "🛳", "⛴", "🛥", "🚢", "✈", "🛩", "🛫", "🛬", "🪂", "🚀", "🛰", "🚡", "🚠", "🚟", "🚋", "🚊", "🚉", "🚈", "🚇", "🚝", "🚞", "🚟", "🚋", "🚌", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎", "🏍", "🛵", "🦽", "🦼", "🛺", "⚓", "⛵", "🛶", "🚤", "🛳", "⛴", "🛥", "🚢"],
  objects: ["⌚", "📱", "📲", "💻", "⌨", "🖥", "🖨", "🖱", "🖲", "🕹", "🗜", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽", "🎞", "📞", "☎", "📟", "📠", "📺", "📻", "🎙", "🎚", "🎛", "🧭", "⏱", "⏲", "⏰", "🕰", "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯", "🪔", "🧯", "🛢", "💸", "💵", "💴", "💶", "💷", "💰", "💳", "💎", "⚖", "🧰", "🔧", "🔨", "⚒", "🛠", "⛏", "🔩", "⚙", "🧱", "⛓", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡", "⚔", "🛡", "🚬", "⚰", "⚱", "🏺", "🔎", "🕳", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🦠", "🧫", "🧪", "🧯", "🔬", "🔭", "📡", "🛰", "🚀", "🛸", "✈", "🛩", "🪂", "🚁", "🛶", "⛵", "🚤", "🛳", "⛴", "🛥", "🚢", "⚓", "🪝", "🎣", "🛒", "🎁", "🎈", "🎏", "🎀", "🎊", "🎉", "🎎", "🎐", "🎌", "🏮", "🎃", "🎄", "🎆", "🎇", "🧨", "✨", "🪄", "🎈", "🎁", "🎀", "🎗", "🎟", "🎫", "🎖", "🏆", "🏅", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸", "🥌", "🎿", "⛷", "🏂", "🪂", "🏋️", "🤼", "🤸", "🤺", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚴", "🚵", "🎪", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🪗", "🎸", "🪕", "🎻", "🪈", "🎲", "♟", "🎯", "🎳", "🎮", "🎰", "🧩"],
  symbols: ["❤", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮", "✝", "☪", "🕉", "☸", "✡", "🔯", "🕎", "☯", "☦", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛", "🉑", "☢", "☣", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷", "✴", "🆚", "💮", "🉐", "㊙", "㊗", "🈴", "🈵", "🈹", "🈲", "🅰", "🅱", "🆎", "🆑", "🅾", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼", "⁉", "🔅", "🔆", "〽", "⚠", "🚸", "🔱", "⚜", "🔰", "♻", "✅", "🈯", "💹", "❇", "✳", "❎", "🌐", "💠", "Ⓜ", "🌀", "💤", "🏧", "🚾", "♿", "🅿", "🈳", "🈂", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ", "🔤", "🔡", "🔠", "🆖", "🆑", "🅾", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼", "⁉", "🔅", "🔆", "〽", "⚠", "🚸", "🔱", "⚜", "🔰", "♻", "✅", "🈯", "💹", "❇", "✳", "❎", "🌐", "💠", "Ⓜ", "🌀", "💤", "🏧", "🚾", "♿", "🅿", "🈳", "🈂", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ", "🔤", "🔡", "🔠", "🆖", "🆑", "🅾", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼", "⁉", "🔅", "🔆", "〽", "⚠", "🚸", "🔱", "⚜", "🔰", "♻", "✅", "🈯", "💹", "❇", "✳", "❎", "🌐", "💠", "Ⓜ", "🌀", "💤", "🏧", "🚾", "♿", "🅿", "🈳", "🈂", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "🚻", "🚮", "🎦", "📶", "🈁"]
};

// Voice recording state
let voiceRecorder = {
  mediaRecorder: null,
  audioChunks: [],
  startTime: null,
  timerInterval: null,
  isRecording: false,
  shouldSend: false,
};

// State for UI
let currentEmojiCategory = 'recent';
let recentEmojis = JSON.parse(localStorage.getItem('recentEmojis') || '[]');

// Event management utilities
const eventListeners = new Map();

const addEventListenerSafe = (element, event, handler, options) => {
  if (!element) return null;
  
  const wrappedHandler = (...args) => {
    try {
      handler(...args);
    } catch (error) {
      console.error(`Error in ${event} handler:`, error);
      showToast('Ocorreu um erro inesperado', 'error');
    }
  };
  
  element.addEventListener(event, wrappedHandler, options);
  
  // Store reference for cleanup
  const key = `${element.constructor.name}-${event}-${Date.now()}`;
  eventListeners.set(key, { element, event, handler: wrappedHandler });
  
  return key;
};

const removeEventListenerSafe = (key) => {
  const listener = eventListeners.get(key);
  if (listener) {
    listener.element.removeEventListener(listener.event, listener.handler);
    eventListeners.delete(key);
  }
};

const removeAllEventListeners = () => {
  eventListeners.forEach((listener, key) => {
    listener.element.removeEventListener(listener.event, listener.handler);
  });
  eventListeners.clear();
};

// Enhanced error handling
const handleAsyncError = async (promise, fallback = null) => {
  try {
    return await promise;
  } catch (error) {
    console.error('Async operation failed:', error);
    showToast(error.message || 'Ocorreu um erro', 'error');
    return fallback;
  }
};

const validateInput = (value, rules = {}) => {
  const errors = [];
  
  if (rules.required && (!value || value.trim() === '')) {
    errors.push('Este campo é obrigatório');
  }
  
  if (rules.minLength && value.length < rules.minLength) {
    errors.push(`Mínimo de ${rules.minLength} caracteres`);
  }
  
  if (rules.maxLength && value.length > rules.maxLength) {
    errors.push(`Máximo de ${rules.maxLength} caracteres`);
  }
  
  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push('Formato inválido');
  }
  
  return errors;
};

// UI Feedback utilities
const showLoadingState = (element, loadingText = 'Carregando...') => {
  if (!element) return null;
  
  // Preserve innerHTML (including SVGs) instead of just textContent
  const originalContent = element.innerHTML;
  const originalDisabled = element.disabled;
  
  element.disabled = true;
  element.innerHTML = loadingText;
  element.dataset.originalContent = originalContent;
  element.dataset.originalDisabled = originalDisabled;
  
  return () => {
    // Return restore function
    element.disabled = originalDisabled;
    element.innerHTML = originalContent;
    delete element.dataset.originalContent;
    delete element.dataset.originalDisabled;
  };
};

const showElementError = (element, errorText = 'Erro') => {
  if (!element) return;
  
  element.classList.add('error');
  element.setAttribute('aria-invalid', 'true');
  
  setTimeout(() => {
    element.classList.remove('error');
    element.removeAttribute('aria-invalid');
  }, 3000);
};

const showToast = (message, type = 'info', duration = 3000) => {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
};

// Performance utilities
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Safe DOM manipulation
const safeQuerySelector = (selector, fallback = null) => {
  try {
    return document.querySelector(selector) || fallback;
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return fallback;
  }
};

const safeElementOperation = (element, operation, fallback = null) => {
  try {
    if (element && typeof operation === 'function') {
      return operation(element);
    }
    return fallback;
  } catch (error) {
    console.warn('Element operation failed:', error);
    return fallback;
  }
};

// Debounced search for input
const debouncedSearch = debounce(() => {
  renderChats();
}, 300);

function formatTime(ts) {
  if (!ts) return "--:--";
  
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatVoiceTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function addToRecentEmojis(emoji) {
  // Remove emoji if it already exists
  recentEmojis = recentEmojis.filter(e => e !== emoji);
  // Add to beginning
  recentEmojis.unshift(emoji);
  // Keep only last 24
  recentEmojis = recentEmojis.slice(0, 24);
  // Save to localStorage
  localStorage.setItem('recentEmojis', JSON.stringify(recentEmojis));
  // Update recent category
  emojiCategories.recent = recentEmojis;
}

function hideAllMenus() {
  const menus = [elements.attachMenu, elements.emojiPicker, elements.voiceRecorder, elements.businessOptions];
  
  menus.forEach(menu => {
    if (menu) {
      safeElementOperation(menu, (el) => el.classList.add('hidden'));
    }
  });
  
  // Reset voice recording state if active
  if (voiceRecorder.isRecording) {
    cancelVoiceRecording();
  }
}

function showAttachMenu() {
  hideAllMenus();
  elements.attachMenu.classList.remove('hidden');
}

function showEmojiPicker() {
  hideAllMenus();
  elements.emojiPicker.classList.remove('hidden');
  renderEmojiGrid(currentEmojiCategory);
}

function showVoiceRecorder() {
  hideAllMenus();
  elements.voiceRecorder.classList.remove('hidden');
}

function showBusinessOptions() {
  hideAllMenus();
  elements.businessOptions.classList.remove('hidden');
}

function renderEmojiGrid(category) {
  if (!elements.emojiGrid) return;
  
  const emojis = emojiCategories[category] || [];
  const fragment = document.createDocumentFragment();
  
  emojis.forEach(emoji => {
    const button = document.createElement('button');
    button.className = 'emoji-item';
    button.textContent = emoji;
    button.setAttribute('aria-label', `Emoji ${emoji}`);
    button.onclick = () => insertEmoji(emoji);
    fragment.appendChild(button);
  });
  
  elements.emojiGrid.innerHTML = '';
  elements.emojiGrid.appendChild(fragment);
}

function insertEmoji(emoji) {
  if (!elements.messageInput) return;
  
  try {
    const cursorPos = elements.messageInput.selectionStart;
    const textBefore = elements.messageInput.value.substring(0, cursorPos);
    const textAfter = elements.messageInput.value.substring(cursorPos);
    
    elements.messageInput.value = textBefore + emoji + textAfter;
    
    // Set cursor position after emoji
    const newCursorPos = cursorPos + emoji.length;
    elements.messageInput.setSelectionRange(newCursorPos, newCursorPos);
    
    addToRecentEmojis(emoji);
    hideAllMenus();
    
    // Trigger input event for auto-resize
    elements.messageInput.dispatchEvent(new Event('input'));
  } catch (error) {
    console.error('Error inserting emoji:', error);
  }
}

function startVoiceRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      voiceRecorder.mediaRecorder = new MediaRecorder(stream);
      voiceRecorder.audioChunks = [];
      voiceRecorder.startTime = Date.now();
      voiceRecorder.shouldSend = false;
      
      voiceRecorder.mediaRecorder.ondataavailable = event => {
        voiceRecorder.audioChunks.push(event.data);
      };
      
      voiceRecorder.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(voiceRecorder.audioChunks, { type: 'audio/webm' });
        if (voiceRecorder.shouldSend && audioBlob.size > 0) {
          sendVoiceMessage(audioBlob);
        }
      };
      
      voiceRecorder.mediaRecorder.start();
      voiceRecorder.isRecording = true;
      
      // Update UI
      safeElementOperation(elements.voiceBtn, (btn) => btn.classList.add('recording'));
      safeElementOperation(elements.sendVoiceBtn, (btn) => btn.classList.remove('hidden'));
      
      // Start timer
      updateVoiceTimer();
      voiceRecorder.timerInterval = setInterval(updateVoiceTimer, 100);
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      showToast('Não foi possível acessar o microfone. Verifique as permissões.', 'error');
    });
}

function stopVoiceRecording({ send = true } = {}) {
  if (voiceRecorder.mediaRecorder && voiceRecorder.isRecording) {
    voiceRecorder.shouldSend = send;
    voiceRecorder.mediaRecorder.stop();
    voiceRecorder.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    voiceRecorder.isRecording = false;
    
    // Stop timer
    if (voiceRecorder.timerInterval) {
      clearInterval(voiceRecorder.timerInterval);
      voiceRecorder.timerInterval = null;
    }
    
    // Update UI
    elements.voiceBtn.classList.remove('recording');
    elements.sendVoiceBtn.classList.add('hidden');
  }
}

function updateVoiceTimer() {
  if (voiceRecorder.startTime) {
    const elapsed = (Date.now() - voiceRecorder.startTime) / 1000;
    elements.voiceTimer.textContent = formatVoiceTime(elapsed);
  }
}

function cancelVoiceRecording() {
  stopVoiceRecording({ send: false });
  hideAllMenus();
  elements.voiceTimer.textContent = '00:00';
}

async function sendVoiceMessage(audioBlob) {
  if (!state.sessionId) {
    showToast('Conecte uma sessão primeiro', 'error');
    return;
  }

  if (!state.activeJid) {
    showToast('Selecione um contato primeiro', 'error');
    return;
  }
  
  try {
    showToast('Enviando áudio...', 'info');

    const seconds = voiceRecorder.startTime
      ? Math.max(1, Math.round((Date.now() - voiceRecorder.startTime) / 1000))
      : undefined;

    const payload = {
      jid: state.activeJid,
      type: 'media',
      mediaDataUrl: await fileToDataUrl(audioBlob),
      mimetype: audioBlob?.type || 'audio/webm',
      fileName: 'voice.webm',
      ptt: true,
      seconds,
    };

    await callApi(`/session/${encodeURIComponent(state.sessionId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    showToast('Áudio enviado com sucesso!', 'success');
    
    // Reset timer
    if (elements.voiceTimer) elements.voiceTimer.textContent = '00:00';
    hideAllMenus();
    
    // Refresh messages
    await loadMessages(state.activeJid);
  } catch (error) {
    console.error('Error sending voice message:', error);
    showToast(`Erro ao enviar mensagem de voz: ${error.message}`, 'error');
  }
}

async function handleFileUpload(file, type) {
  if (!state.sessionId) {
    showToast('Conecte uma sessão primeiro', 'error');
    return;
  }

  if (!state.activeJid) {
    showToast('Selecione um contato primeiro', 'error');
    return;
  }
  
  if (!file) {
    showToast('Selecione um arquivo', 'error');
    return;
  }
  
  // Validate file size (max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    showToast('Arquivo muito grande. Máximo 50MB', 'error');
    return;
  }
  
  try {
    showToast(`Enviando ${file.name}...`, 'info', 10000);

    const payload = {
      jid: state.activeJid,
      type: 'media',
      mediaDataUrl: await fileToDataUrl(file),
      mimetype: file.type || undefined,
      fileName: file.name,
    };

    await callApi(`/session/${encodeURIComponent(state.sessionId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    showToast(`${file.name} enviado com sucesso!`, 'success');
    hideAllMenus();
    await loadMessages(state.activeJid);
  } catch (error) {
    console.error('Error sending media:', error);
    showToast(`Erro ao enviar ${file.name}: ${error.message}`, 'error');
  }
}

function setupBusinessMessage(type) {
  elements.messageType.value = 'interactive';
  
  switch (type) {
    case 'interactive':
      elements.interactiveJson.value = JSON.stringify({
        mode: "buttons",
        buttons: [
          { id: "opt_1", text: "Opção 1" },
          { id: "opt_2", text: "Opção 2" }
        ]
      }, null, 2);
      break;
    case 'list':
      elements.interactiveJson.value = JSON.stringify({
        mode: "list",
        buttonText: "Ver opções",
        sections: [
          {
            title: "Categoria 1",
            rows: [
              { id: "item_1", title: "Item 1", description: "Descrição 1" },
              { id: "item_2", title: "Item 2", description: "Descrição 2" }
            ]
          }
        ]
      }, null, 2);
      break;
    case 'location':
      elements.interactiveJson.value = JSON.stringify({
        type: "location",
        location: {
          latitude: -23.5505,
          longitude: -46.6333,
          name: "São Paulo",
          address: "São Paulo, SP, Brasil"
        }
      }, null, 2);
      break;
    case 'product':
      elements.interactiveJson.value = JSON.stringify({
        type: "product",
        catalogId: "catalog_123",
        productIds: ["product_1", "product_2"]
      }, null, 2);
      break;
  }
  
  hideAllMenus();
  elements.messageInput.focus();
}

function autoResizeTextarea() {
  if (!elements.messageInput) return;
  
  safeElementOperation(elements.messageInput, (textarea) => {
    const originalHeight = textarea.style.height;
    textarea.style.height = 'auto';
    
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${newHeight}px`;
    
    // Only scroll if height actually changed
    if (originalHeight !== textarea.style.height) {
      scrollToBottom(false);
    }
  });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "";

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "visto agora";
  if (minutes < 60) return `visto há ${minutes}min`;
  if (hours < 24) return `visto há ${hours}h`;
  if (days < 7) return `visto há ${days}d`;

  return formatTime(timestamp);
}

function formatPhoneNumber(jid) {
  const phone = jid?.split("@")[0]?.split(":")[0]?.split("_")[0] || "";
  if (!phone || phone.length < 10) return phone;

  // Formata número brasileiro: +55 (11) 99999-9999
  if (phone.startsWith("55") && phone.length >= 12) {
    const ddd = phone.slice(2, 4);
    const num = phone.slice(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
    }
    if (num.length === 8) {
      return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
    }
  }

  return `+${phone}`;
}

async function updateProfilePicture(jid) {
  if (!elements.chatProfilePicture || !state.sessionId) return;

  try {
    // Verifica se o chat já tem foto cacheada
    const chat = state.chats.find(c => c.jid === jid);
    if (chat?.profilePictureUrl) {
      renderProfilePicture(chat.profilePictureUrl);
      return;
    }

    // Busca da API
    const data = await callApi(`/session/${encodeURIComponent(state.sessionId)}/profile-picture/${encodeURIComponent(jid)}`);
    
    if (data.profilePictureUrl) {
      renderProfilePicture(data.profilePictureUrl);
      
      // Atualiza o chat no estado
      if (chat) {
        chat.profilePictureUrl = data.profilePictureUrl;
      }
    } else {
      // Mostra placeholder se não tiver foto
      renderProfilePicture(null);
    }
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    renderProfilePicture(null);
  }
}

function renderProfilePicture(url) {
  if (!elements.chatProfilePicture) return;

  if (url) {
    elements.chatProfilePicture.innerHTML = `<img src="${url}" alt="Foto de perfil" class="profile-image" />`;
  } else {
    elements.chatProfilePicture.innerHTML = `
      <svg class="profile-placeholder" width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="20" fill="#E5E7EB"/>
        <circle cx="20" cy="16" r="6" fill="#9CA3AF"/>
        <path d="M8 32C8 26.5 12.5 22 20 22C27.5 22 32 26.5 32 32" fill="#9CA3AF"/>
      </svg>
    `;
  }
}

function displayName(chat, usePhone = true) {
  // Prioriza nome salvo do chat
  const name = chat?.name?.trim();
  if (name && name.length > 0 && !name.match(/^\d+$/)) {
    return name;
  }

  // Fallback para o JID formatado
  if (usePhone && chat?.jid) {
    return formatPhoneNumber(chat.jid);
  }

  const jidUser = chat?.jid?.split("@")[0] || "";
  const normalizedUser = jidUser.split(":")[0]?.split("_")[0];
  return normalizedUser || "Sem nome";
}

function escapeHtml(value = "") {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value).replace(/[&<>"']/g, (char) => entities[char] || char);
}

function messagesSignature(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return "0";
  }

  const lastMessage = messages[messages.length - 1];
  return `${messages.length}:${lastMessage?.id || ""}:${lastMessage?.timestamp || ""}:${lastMessage?.status || ""}`;
}

function normalizeConnectionStatus(status) {
  if (
    status === "qr" ||
    status === "connecting" ||
    status === "connected" ||
    status === "closed"
  ) {
    return status;
  }

  return "idle";
}

function setConnectionVisual(status) {
  const normalizedStatus = normalizeConnectionStatus(status);

  if (elements.connectionDot) {
    elements.connectionDot.className = `connection-dot connection-dot-${normalizedStatus}`;
  }

  if (elements.connectionPill) {
    elements.connectionPill.className = `connection-pill connection-pill-${normalizedStatus}`;
    elements.connectionPill.textContent = connectionLabels[normalizedStatus];
  }
}

function qrImageUrl(text) {
  return `https://quickchart.io/qr?size=280&margin=1&text=${encodeURIComponent(text)}`;
}

function showConnectedUI() {
  elements.connectScreen.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
}

function showConnectUI() {
  elements.connectScreen.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
}

function setConnectionStatus(text) {
  elements.connectionStatus.textContent = text;
}

function renderConnectionState(connectionState) {
  const status = normalizeConnectionStatus(connectionState?.status);
  setConnectionVisual(status);

  if (status === "qr" && connectionState.qr) {
    setConnectionStatus("Escaneie o QR code no WhatsApp do celular.");
    elements.qrImage.src = qrImageUrl(connectionState.qr);
    elements.qrWrapper.classList.remove("hidden");
    return;
  }

  elements.qrWrapper.classList.add("hidden");
  elements.qrImage.removeAttribute("src");

  if (status === "connecting") {
    setConnectionStatus("Conectando ao WhatsApp...");
    return;
  }

  if (status === "connected") {
    setConnectionStatus("Conectado com sucesso.");
    return;
  }

  if (status === "closed") {
    setConnectionStatus(
      "Sessao encerrada. Gere um novo QR code para reconectar.",
    );
    return;
  }

  setConnectionStatus("Aguardando conexao...");
}

const getVisibleChats = () => {
  const query = (elements.chatSearchInput?.value || "").trim().toLowerCase();

  if (!query) {
    return state.chats;
  }

  return state.chats.filter((chat) => {
    const chatName = displayName(chat).toLowerCase();
    const chatJid = (chat.jid || "").toLowerCase();
    return chatName.includes(query) || chatJid.includes(query);
  });
};

const renderChats = throttle(() => {
  if (!elements.chatList) return;
  
  const visibleChats = getVisibleChats();

  if (!state.chats.length) {
    elements.chatList.innerHTML = '<p class="empty-state">Sem conversas ainda.</p>';
    return;
  }

  if (!visibleChats.length) {
    elements.chatList.innerHTML = '<p class="empty-state">Nenhuma conversa encontrada para esse filtro.</p>';
    return;
  }

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  visibleChats.forEach((chat) => {
    const activeClass = chat.jid === state.activeJid ? "active" : "";
    const unread = chat.unread > 0 ? `<span class="badge">${chat.unread}</span>` : "";
    const chatTitle = escapeHtml(displayName(chat));
    const chatPreview = escapeHtml(chat.lastMessage || "Sem mensagens recentes");
    const timeLabel = chat.lastTimestamp ? formatTime(chat.lastTimestamp) : "";
    
    const button = document.createElement('button');
    button.className = `chat-item ${activeClass}`;
    button.dataset.jid = encodeURIComponent(chat.jid);
    button.setAttribute('aria-label', `Chat com ${chatTitle}`);
    
    button.innerHTML = `
      <div class="chat-header-row">
        <div class="chat-title">${chatTitle}</div>
        <span class="chat-time">${timeLabel}</span>
      </div>
      <div class="chat-subline">
        <span class="chat-preview">${chatPreview}</span>
        ${unread}
      </div>
    `;
    
    // Use safe event listener
    const eventKey = addEventListenerSafe(button, "click", () => {
      const jid = decodeURIComponent(button.dataset.jid || "");
      selectChat(jid);
    });
    
    // Store event key for cleanup
    button.dataset.eventKey = eventKey;
    fragment.appendChild(button);
  });
  
  // Clean up existing event listeners
  const existingButtons = elements.chatList.querySelectorAll('.chat-item');
  existingButtons.forEach(button => {
    const eventKey = button.dataset.eventKey;
    if (eventKey) {
      removeEventListenerSafe(eventKey);
    }
  });
  
  elements.chatList.innerHTML = '';
  elements.chatList.appendChild(fragment);
}, 100);

function mediaCacheKey(message) {
  return `${state.sessionId || ""}|${message?.jid || ""}|${message?.id || ""}`;
}

function isPreviewableMedia(message) {
  return (
    !!message?.media?.hasMedia &&
    ["image", "video", "audio", "sticker", "document"].includes(message?.type)
  );
}

async function ensureMediaLoaded(message) {
  if (!state.sessionId || !isPreviewableMedia(message)) {
    return null;
  }

  const cacheKey = mediaCacheKey(message);

  if (state.mediaCache.has(cacheKey)) {
    return state.mediaCache.get(cacheKey);
  }

  if (state.pendingMedia.has(cacheKey)) {
    return null;
  }

  state.pendingMedia.add(cacheKey);

  try {
    const data = await callApi(
      `/session/${encodeURIComponent(state.sessionId)}/media/${encodeURIComponent(message.jid)}/${encodeURIComponent(message.id)}`,
    );

    const payload = {
      mimeType: data?.mimeType,
      dataUrl: data?.dataUrl,
    };

    state.mediaCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    console.error(`[MEDIA ERROR] Failed to load media for message ${message.id} from ${message.jid}:`, error);
    console.error(`[MEDIA ERROR] Message details:`, {
      id: message.id,
      jid: message.jid,
      type: message.type,
      hasMedia: !!message.media,
      mediaKey: message.media?.mediaKey,
      mimetype: message.media?.mimetype
    });
    return null;
  } finally {
    state.pendingMedia.delete(cacheKey);
  }
}

async function hydrateMediaForActiveMessages() {
  const targets = state.activeMessages.filter(
    (message) =>
      isPreviewableMedia(message) &&
      !state.mediaCache.has(mediaCacheKey(message)),
  );

  if (!targets.length) {
    return;
  }

  const newestFirst = [...targets]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
  await Promise.all(newestFirst.map((message) => ensureMediaLoaded(message)));
  renderMessages();
}

function messageStatusLabel(message) {
  if (!message?.fromMe) {
    return "";
  }

  const statusIcons = {
    played: "✓✓",
    read: "✓✓",
    delivery_ack: "✓✓",
    server_ack: "✓",
    pending: "…",
  };

  return statusIcons[message.status] || "";
}

function renderMessageBody(message) {
  const safeText = escapeHtml(message.text || "").replace(/\n/g, "<br />");
  const cache = state.mediaCache.get(mediaCacheKey(message));

  if (message.type === "image" || message.type === "sticker") {
    if (cache?.dataUrl) {
      return `
        <div class="media-wrap">
          <img class="message-media-img" src="${cache.dataUrl}" alt="midia" />
        </div>
        ${safeText ? `<div class="message-text">${safeText}</div>` : ""}
      `;
    }

    return `<button class="load-media-btn" data-message-id="${escapeHtml(message.id)}">Carregar midia</button>${
      safeText ? `<div class="message-text">${safeText}</div>` : ""
    }`;
  }

  if (message.type === "video") {
    if (cache?.dataUrl) {
      return `
        <div class="media-wrap">
          <video class="message-media-video" controls src="${cache.dataUrl}"></video>
        </div>
        ${safeText ? `<div class="message-text">${safeText}</div>` : ""}
      `;
    }

    return `<button class="load-media-btn" data-message-id="${escapeHtml(message.id)}">Carregar video</button>${
      safeText ? `<div class="message-text">${safeText}</div>` : ""
    }`;
  }

  if (message.type === "audio") {
    if (cache?.dataUrl) {
      return `
        <div class="media-wrap">
          <audio controls src="${cache.dataUrl}"></audio>
        </div>
      `;
    }

    return (
      '<button class="load-media-btn" data-message-id="' +
      escapeHtml(message.id) +
      '">Carregar audio</button>'
    );
  }

  if (message.type === "document") {
    if (cache?.dataUrl) {
      const fileName = escapeHtml(message.media?.fileName || "arquivo");
      return `<a class="doc-link" href="${cache.dataUrl}" download="${fileName}">Baixar ${fileName}</a>${
        safeText ? `<div class="message-text">${safeText}</div>` : ""
      }`;
    }

    return `<button class="load-media-btn" data-message-id="${escapeHtml(message.id)}">Carregar documento</button>${
      safeText ? `<div class="message-text">${safeText}</div>` : ""
    }`;
  }

  if (message.type === "interactive") {
    const interactive = message.interactive || {};
    const options = (interactive.options || [])
      .map(
        (option) =>
          `<li>${escapeHtml(option.title || option.id || "Opcao")}</li>`,
      )
      .join("");

    return `
      <div class="message-text">${safeText || "[Mensagem interativa]"}</div>
      ${options ? `<ul class="interactive-options">${options}</ul>` : ""}
    `;
  }

  if (message.type === "reaction") {
    return `<div class="message-text">${safeText || "[Reacao]"}</div>`;
  }

  if (message.isDeleted) {
    return '<div class="message-text">[Mensagem apagada]</div>';
  }

  return `<div class="message-text">${safeText || "(mensagem vazia)"}</div>`;
}

const renderMessages = throttle(() => {
  if (!elements.messageList) return;
  
  if (!state.activeJid) {
    elements.chatHeaderTitle.textContent = "Selecione uma conversa";
    elements.chatHeaderSubtitle.textContent = "Escolha um contato para abrir o historico.";
    elements.messageList.innerHTML = '<div class="message-empty">Projeto desenvolvido por Rodrigo Marafon.</div>';
    return;
  }

  const chat = state.chats.find((item) => item.jid === state.activeJid);
  const fallbackTitle = state.activeJid.split("@")[0]?.split(":")[0]?.split("_")[0] || state.activeJid;
  const lastSeenText = chat?.lastTimestamp ? formatLastSeen(chat.lastTimestamp) : "";
  const contactName = chat ? displayName(chat) : fallbackTitle;

  // Update header
  if (elements.chatHeaderTitle) elements.chatHeaderTitle.textContent = contactName;
  if (elements.chatHeaderSubtitle) elements.chatHeaderSubtitle.textContent = lastSeenText || state.activeJid;
  if (elements.jidInput) elements.jidInput.value = state.activeJid;

  if (!state.activeMessages.length) {
    elements.messageList.innerHTML = '<div class="message-empty">Nenhuma mensagem neste chat ainda.</div>';
    return;
  }

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  const messageElements = new Map(); // Store references for event handling
  
  state.activeMessages.forEach((message) => {
    const direction = message.direction === "outbound" ? "outbound" : "inbound";
    const editedTag = message.isEdited ? '<span class="message-flag">editada</span>' : "";
    const status = messageStatusLabel(message);
    const statusTag = status ? `<span class="message-status">${status}</span>` : "";
    const fromGroupParticipant = !message.fromMe && message.participant && message.participant !== message.jid
      ? `<div class="message-participant">${escapeHtml(message.name || message.participant)}</div>`
      : "";
    const senderName = !message.fromMe
      ? `<div class="message-sender">${escapeHtml(contactName)}</div>`
      : `<div class="message-sender message-sender-me">Você</div>`;
    const quoted = message.quoted?.text
      ? `<blockquote class="message-quote">${escapeHtml(message.quoted.text)}</blockquote>`
      : "";
    const reactions = Array.isArray(message.reactions) && message.reactions.length
      ? `<div class="message-reactions">${message.reactions
          .map((reaction) => `<span>${escapeHtml(reaction.emoji || "")}</span>`)
          .join("")}</div>`
      : "";

    const article = document.createElement('article');
    article.className = `message ${direction}`;
    article.dataset.messageId = escapeHtml(message.id);
    article.setAttribute('aria-label', `Message from ${message.fromMe ? 'you' : contactName}`);
    
    article.innerHTML = `
      ${fromGroupParticipant}
      ${!message.fromMe || message.participant ? senderName : ""}
      ${quoted}
      ${renderMessageBody(message)}
      ${reactions}
      <div class="message-meta">
        ${editedTag}
        <span class="message-time">${formatTime(message.timestamp)}</span>
        ${statusTag}
      </div>
    `;
    
    // Store reference for event handling
    messageElements.set(message.id, article);
    fragment.appendChild(article);
  });
  
  elements.messageList.innerHTML = '';
  elements.messageList.appendChild(fragment);
  
  // Add event listeners after DOM is ready
  const loadMediaButtons = elements.messageList.querySelectorAll('.load-media-btn');
  loadMediaButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const messageId = button.dataset.messageId;
      const message = state.activeMessages.find((item) => item.id === messageId);
      
      if (message) {
        button.disabled = true;
        button.textContent = 'Carregando...';
        await ensureMediaLoaded(message);
        renderMessages();
      }
    });
  });

  const messageNodes = elements.messageList.querySelectorAll('.message');
  messageNodes.forEach((node) => {
    node.addEventListener("click", () => {
      const messageId = node.dataset.messageId || "";
      state.selectedMessageId = messageId;
      if (elements.reactionMessageId) elements.reactionMessageId.value = messageId;
      if (elements.jidInput) elements.jidInput.value = state.activeJid || elements.jidInput.value;
    });
  });
  
  scrollToBottom(false);
}, 100);

function scrollToBottom(smooth = true) {
  elements.messageList.scrollTo({
    top: elements.messageList.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

async function callApi(url, options = {}, allowRetry = true) {
  const headers = { "Content-Type": "application/json" };
  
  // Add authentication header if available
  if (state.accessToken) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }
  
  const response = await fetch(url, {
    headers,
    ...options,
  });

  if (response.status === 401 && allowRetry) {
    await refreshAccessToken();
    return callApi(url, options, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Falha na API");
  }

  return response.json();
}

const loadChats = debounce(async () => {
  if (!state.sessionId) return;

  try {
    const data = await callApi(`/session/${encodeURIComponent(state.sessionId)}/chats`);
    state.chats = Array.isArray(data.chats) ? data.chats : [];
    let shouldRenderMessages = !state.activeJid;

    if (state.activeJid) {
      const hasActiveChat = state.chats.some((chat) => chat.jid === state.activeJid);
      if (!hasActiveChat) {
        state.activeJid = null;
        state.activeMessages = [];
        state.activeMessagesSignature = "0";
        shouldRenderMessages = true;
      }
    }

    renderChats();

    if (shouldRenderMessages) {
      renderMessages();
    }
  } catch (error) {
    console.error('Error loading chats:', error);
    showToast('Erro ao carregar conversas', 'error');
  }
}, 500);

const selectChat = debounce(async (jid) => {
  if (!state.sessionId || !jid) return;

  try {
    const data = await callApi(`/session/${encodeURIComponent(state.sessionId)}/messages/${encodeURIComponent(jid)}`);
    const resolvedJid = data?.jid || jid;
    const nextMessages = Array.isArray(data.messages) ? data.messages : [];
    const nextSignature = messagesSignature(nextMessages);
    const isSameChat = state.activeJid === resolvedJid;
    const hasChanged = !isSameChat || state.activeMessagesSignature !== nextSignature;

    state.activeJid = resolvedJid;

    if (hasChanged) {
      state.activeMessages = nextMessages;
      state.activeMessagesSignature = nextSignature;
      renderMessages();
      hydrateMediaForActiveMessages().catch((error) => console.error(error));
      
      // Atualiza foto de perfil quando mudar de chat
      updateProfilePicture(resolvedJid);
    }

    // Atualiza a lista de chats para marcar como lido
    renderChats();
  } catch (error) {
    console.error('Error selecting chat:', error);
    showToast('Erro ao carregar mensagens', 'error');
  }
}, 200);

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function applyComposerType() {
  const type = elements.messageType.value;

  const showMedia = type === "media" || type === "sticker";
  const showReaction = type === "reaction";
  const showInteractive = type === "interactive";

  elements.mediaUrlInput.classList.toggle("hidden", !showMedia);
  elements.mediaFileInput.classList.toggle("hidden", !showMedia);
  elements.mimeInput.classList.toggle("hidden", !showMedia);
  elements.fileNameInput.classList.toggle("hidden", !showMedia);

  elements.reactionMessageId.classList.toggle("hidden", !showReaction);
  elements.reactionEmoji.classList.toggle("hidden", !showReaction);

  elements.interactiveJson.classList.toggle("hidden", !showInteractive);

  if (type === "text") {
    elements.messageInput.placeholder = "Digite uma mensagem";
  } else if (type === "media") {
    elements.messageInput.placeholder = "Legenda opcional da midia";
    elements.mediaFileInput.accept = "*/*";
  } else if (type === "sticker") {
    elements.messageInput.placeholder = "Legenda opcional";
    elements.mediaFileInput.accept = "image/webp,image/*";
  } else if (type === "reaction") {
    elements.messageInput.placeholder = "Nao usado para reaction";
  } else {
    elements.messageInput.placeholder =
      "Texto principal da mensagem interativa";
  }
}

async function sendMessage(event) {
  event.preventDefault();

  if (!state.sessionId) {
    showToast('Conecte uma sessão primeiro', 'error');
    return;
  }

  const jid = state.activeJid || elements.jidInput.value.trim();
  const type = elements.messageType.value;
  const text = elements.messageInput.value.trim();

  if (!jid) {
    showToast('Selecione um contato ou informe um JID', 'error');
    return;
  }

  if (!text && type !== 'interactive') {
    showToast('Digite uma mensagem', 'error');
    return;
  }

  const payload = { jid, type };

  if (type === "text") {
    payload.text = text;
  }

  if (type === "media" || type === "sticker") {
    payload.text = text;

    const file = elements.mediaFileInput.files?.[0];
    const mediaUrl = elements.mediaUrlInput.value.trim();
    const mimeFromInput = elements.mimeInput.value.trim();
    const fileNameFromInput = elements.fileNameInput.value.trim();

    if (!file && !mediaUrl) {
      showToast('Selecione um arquivo ou informe uma URL de mídia', 'error');
      return;
    }

    if (mediaUrl) {
      payload.mediaUrl = mediaUrl;
    }

    if (file) {
      payload.mediaDataUrl = await fileToDataUrl(file);
      payload.fileName = fileNameFromInput || file.name;
      payload.mimetype = mimeFromInput || file.type || undefined;
    } else {
      payload.fileName = fileNameFromInput || undefined;
      payload.mimetype = mimeFromInput || undefined;
    }
  }

  if (type === "reaction") {
    const messageId = elements.reactionMessageId.value.trim() || state.selectedMessageId;
    const emoji = elements.reactionEmoji.value.trim();

    if (!messageId) {
      showToast('Selecione uma mensagem no chat para reagir', 'error');
      return;
    }

    payload.reaction = { messageId, emoji };
  }

  if (type === "interactive") {
    payload.text = text;

    const raw = elements.interactiveJson.value.trim();
    let interactivePayload = {};

    if (raw) {
      try {
        interactivePayload = JSON.parse(raw);
      } catch {
        showToast('JSON interativo inválido', 'error');
        return;
      }
    }

    payload.interactive = interactivePayload;
  }

  const restoreSendBtn = showLoadingState(elements.sendBtn, 'Enviando...');
  
  try {
    await callApi(`/session/${encodeURIComponent(state.sessionId)}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    
    if (type === "media" || type === "sticker") {
      elements.mediaUrlInput.value = '';
      elements.mediaFileInput.value = '';
    }

    await loadChats();
    await selectChat(jid);
    
    showToast('Mensagem enviada com sucesso!', 'success');
  } catch (error) {
    console.error('Error sending message:', error);
    showToast('Erro ao enviar mensagem', 'error');
  } finally {
    restoreSendBtn?.();
  }
}

async function getConnectionState(sessionId) {
  const data = await callApi(
    `/session/${encodeURIComponent(sessionId)}/status`,
  );
  return data.state;
}

function startHistoryRefresh() {
  if (state.historyRefreshInterval) {
    clearInterval(state.historyRefreshInterval);
  }

  state.historyRefreshInterval = setInterval(async () => {
    try {
      await loadChats();
      
      // Verifica se há novas mensagens no chat ativo
      if (state.activeJid) {
        const currentChat = state.chats.find(c => c.jid === state.activeJid);
        
        // Se há mensagens não lidas ou o chat foi atualizado recentemente
        if (currentChat && (currentChat.unread > 0 || 
            (Date.now() - currentChat.lastTimestamp) < 10000)) {
          await selectChat(state.activeJid);
        }
      }
    } catch (error) {
      console.error('Error in history refresh:', error);
    }
  }, 3000); // 3 segundos para melhor responsividade
}

function stopHistoryRefresh() {
  if (state.historyRefreshInterval) {
    clearInterval(state.historyRefreshInterval);
    state.historyRefreshInterval = null;
  }
}

function stopConnectionPolling() {
  if (state.connectionInterval) {
    clearInterval(state.connectionInterval);
    state.connectionInterval = null;
  }
}

function startConnectionPolling(sessionId) {
  stopConnectionPolling();

  state.connectionInterval = setInterval(async () => {
    try {
      const connectionState = await getConnectionState(sessionId);
      renderConnectionState(connectionState);

      if (connectionState.status === "connected") {
        stopConnectionPolling();
        showConnectedUI();
        await loadChats();
        if (state.activeJid) {
          await selectChat(state.activeJid);
        }
        startHistoryRefresh();
      }
    } catch (error) {
      console.error(error);
    }
  }, 2000);
}

async function startSessionConnection(sessionId) {
  if (!sessionId) return;

  stopConnectionPolling();
  stopHistoryRefresh();

  state.sessionId = sessionId;
  state.chats = [];
  state.activeJid = null;
  state.activeMessages = [];
  state.activeMessagesSignature = "0";
  state.selectedMessageId = "";
  state.mediaCache = new Map();
  state.pendingMedia = new Set();

  updateIdentityLabels(sessionId);
  showConnectUI();
  setConnectionVisual("connecting");
  setConnectionStatus("Iniciando sessao...");

  await callApi(`/session/${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
  const connectionState = await getConnectionState(sessionId);
  renderConnectionState(connectionState);

  if (connectionState.status === "connected") {
    showConnectedUI();
    await loadChats();
    startHistoryRefresh();
    await loadAIStatus(); // Carrega status da IA
    return;
  }

  startConnectionPolling(sessionId);
}

// AI Configuration Modal Functions
function showAiConfigModal() {
  loadAiConfig();
  elements.aiConfigModal.classList.remove('hidden');
}

function hideAiConfigModal() {
  elements.aiConfigModal.classList.add('hidden');
  hideConfigStatus();
}

function showConfigStatus(message, type = 'success') {
  elements.configStatus.textContent = message;
  elements.configStatus.className = `config-status ${type}`;
}

function hideConfigStatus() {
  elements.configStatus.className = 'config-status';
}

function switchAiProvider(provider) {
  if (provider === 'google-ai') {
    elements.googleAiConfig.classList.remove('hidden');
  }
}

async function loadAiConfig() {
  try {
    const config = await callApi('/api/ai/config');
    
    // Set provider
    const providerRadio = document.querySelector(`input[name="ai-provider"][value="${config.provider}"]`);
    if (providerRadio) {
      providerRadio.checked = true;
      switchAiProvider(config.provider);
    }
    
    // Load Google AI config
    if (config.googleAI) {
      elements.googleAiApiKey.value = config.googleAI.apiKey && config.googleAI.apiKey !== '***' ? config.googleAI.apiKey : '';
      elements.googleAiModel.value = config.googleAI.model || 'gemini-2.5-flash';
      elements.googleAiTemperature.value = config.googleAI.temperature || 0.7;
      elements.googleAiMaxTokens.value = config.googleAI.maxTokens || 2048;
    }
    
    // Load Bot Context config
    if (config.botContext) {
      elements.systemPrompt.value = config.botContext.systemPrompt || 'Você é um atendente profissional.\nResponda de forma objetiva.\nNunca invente informações.';
      elements.maxHistoryLength.value = config.botContext.maxHistoryLength || 20;
    }
    
    // Load Group Settings config
    if (config.groupSettings) {
      elements.groupAiEnabled.checked = config.groupSettings.enabled || false;
      elements.respondToMentions.checked = config.groupSettings.respondToMentions !== false;
      elements.respondToCommands.checked = config.groupSettings.respondToCommands !== false;
      elements.commandPrefix.value = config.groupSettings.commandPrefix || '!';
      
      // Show/hide group options based on enabled state
      toggleGroupOptions(config.groupSettings.enabled || false);
    } else {
      // Default values
      elements.groupAiEnabled.checked = false;
      elements.respondToMentions.checked = true;
      elements.respondToCommands.checked = true;
      elements.commandPrefix.value = '!';
      toggleGroupOptions(false);
    }
  } catch (error) {
    console.error('Error loading AI config:', error);
    showConfigStatus('Erro ao carregar configuração', 'error');
  }
}

function toggleGroupOptions(enabled) {
  if (enabled) {
    elements.groupOptions.style.display = 'block';
  } else {
    elements.groupOptions.style.display = 'none';
  }
}

saveAiConfig = async function() {
  try {
    const provider = document.querySelector('input[name="ai-provider"]:checked').value;
    
    const config = {
      provider,
      googleAI: provider === 'google-ai' ? {
        apiKey: elements.googleAiApiKey.value.trim(),
        model: elements.googleAiModel.value,
        temperature: parseFloat(elements.googleAiTemperature.value),
        maxTokens: parseInt(elements.googleAiMaxTokens.value)
      } : undefined,
      botContext: {
        systemPrompt: elements.systemPrompt.value.trim(),
        maxHistoryLength: parseInt(elements.maxHistoryLength.value)
      },
      groupSettings: {
        enabled: elements.groupAiEnabled.checked,
        respondToMentions: elements.respondToMentions.checked,
        respondToCommands: elements.respondToCommands.checked,
        commandPrefix: elements.commandPrefix.value.trim() || '!'
      }
    };
    
    const response = await fetch('/api/ai/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });
    
    if (response.ok) {
      showConfigStatus('Configuração salva com sucesso!', 'success');
      setTimeout(hideAiConfigModal, 2000);
    } else {
      const error = await response.json();
      showConfigStatus(error.error || 'Erro ao salvar configuração', 'error');
    }
  } catch (error) {
    console.error('Error saving AI config:', error);
    showConfigStatus('Erro ao salvar configuração', 'error');
  }
};

sendTestMessage = async function() {
  const message = elements.testChatInput.value.trim();
  if (!message) return;

  // Adiciona mensagem do usuário
  addTestMessage(message, 'user');
  elements.testChatInput.value = '';

  try {
    // Pega configuração atual do bot
    const config = await getCurrentBotConfig();
    
    // Envia mensagem para teste
    const response = await fetch('/api/ai/test-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        config
      })
    });

    if (response.ok) {
      const data = await response.json();
      addTestMessage(data.response, 'bot');
    } else {
      const error = await response.json();
      addTestMessage(`Erro: ${error.error || 'Falha ao processar mensagem'}`, 'bot', true);
    }
  } catch (error) {
    console.error('Error testing chat:', error);
    addTestMessage('Erro de conexão com o servidor', 'bot', true);
  }
}

function addTestMessage(content, sender, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `test-message ${sender}-message ${isError ? 'error' : ''}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;
  
  messageDiv.appendChild(contentDiv);
  elements.testChatMessages.appendChild(messageDiv);
  
  // Scroll para baixo
  elements.testChatMessages.scrollTop = elements.testChatMessages.scrollHeight;
}

const loadMessages = debounce(async (jid) => {
  if (!state.sessionId || !jid) return;

  try {
    const data = await callApi(`/session/${encodeURIComponent(state.sessionId)}/messages/${encodeURIComponent(jid)}`);
    const resolvedJid = data?.jid || jid;
    const nextMessages = Array.isArray(data.messages) ? data.messages : [];
    const nextSignature = messagesSignature(nextMessages);
    const isSameChat = state.activeJid === resolvedJid;
    const hasChanged = !isSameChat || state.activeMessagesSignature !== nextSignature;

    state.activeJid = resolvedJid;

    if (hasChanged) {
      state.activeMessages = nextMessages;
      state.activeMessagesSignature = nextSignature;
      renderMessages();
      hydrateMediaForActiveMessages().catch((error) => console.error(error));
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    showToast('Erro ao carregar mensagens', 'error');
  }
}, 300);

// Adiciona uma nova mensagem ao chat atual sem recarregar tudo
function appendNewMessage(message) {
  if (!state.activeJid || message.jid !== state.activeJid) {
    return false; // Não é para o chat atual
  }

  // Verifica se a mensagem já existe
  const exists = state.activeMessages.some(m => m.id === message.id);
  if (exists) {
    return false;
  }

  // Adiciona a mensagem
  state.activeMessages.push(message);
  state.activeMessages.sort((a, b) => a.timestamp - b.timestamp);
  
  // Atualiza a assinatura
  state.activeMessagesSignature = messagesSignature(state.activeMessages);
  
  // Renderiza apenas a nova mensagem para melhor performance
  renderMessages();
  scrollToBottom(false);
  
  return true;
}

// Atualiza uma mensagem existente (status, reações, etc.)
function updateExistingMessage(messageId, updates) {
  const messageIndex = state.activeMessages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    return false;
  }

  // Aplica as atualizações
  Object.assign(state.activeMessages[messageIndex], updates);
  
  // Atualiza a assinatura
  state.activeMessagesSignature = messagesSignature(state.activeMessages);
  
  // Renderiza apenas a mensagem atualizada
  renderMessages();
  
  return true;
}

async function getCurrentBotConfig() {
  const provider = document.querySelector('input[name="ai-provider"]:checked').value;
  
  const config = {
    provider,
    systemPrompt: elements.systemPrompt.value.trim(),
    maxHistoryLength: parseInt(elements.maxHistoryLength.value)
  };

  if (provider === 'google-ai') {
    config.googleAI = {
      apiKey: elements.googleAiApiKey.value.trim(),
      model: elements.googleAiModel.value,
      temperature: parseFloat(elements.googleAiTemperature.value),
      maxTokens: parseInt(elements.googleAiMaxTokens.value)
    };
  }

  return config;
};

testGoogleAiConnection = async function() {
  const apiKey = elements.googleAiApiKey.value.trim();
  const model = elements.googleAiModel.value;
  
  if (!apiKey) {
    showConfigStatus('API Key é obrigatória', 'error');
    return;
  }
  
  try {
    elements.testGoogleAiBtn.disabled = true;
    elements.testGoogleAiBtn.textContent = 'Testando...';
    hideConfigStatus();
    
    const response = await fetch('/api/ai/test-google-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, model })
    });
    
    const result = await response.json();
    
    if (result.valid) {
      showConfigStatus('✅ Conexão com Google AI bem-sucedida!', 'success');
      // Load available models after successful connection
      await loadGoogleAIModels();
    } else {
      showConfigStatus('❌ Falha na conexão. Verifique se a API Key está correta.', 'error');
    }
  } catch (error) {
    console.error('Error testing Google AI:', error);
    showConfigStatus('❌ Erro ao testar conexão. Tente novamente.', 'error');
  } finally {
    elements.testGoogleAiBtn.disabled = false;
    elements.testGoogleAiBtn.textContent = 'Testar';
  }
}

// Load available Google AI models
async function loadGoogleAIModels() {
  const apiKey = elements.googleAiApiKey.value.trim();
  
  if (!apiKey) {
    return;
  }
  
  try {
    const response = await fetch('/api/ai/google-ai-models', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey })
    });
    
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      
      // Save current selection
      const currentModel = elements.googleAiModel.value;
      
      // Clear existing options
      elements.googleAiModel.innerHTML = '';
      
      // Add available models with friendly names
      const modelNames = {
        'gemini-2.5-flash': 'Gemini 2.5 Flash (Rápido)',
        'gemini-2.5-pro': 'Gemini 2.5 Pro (Completo)',
        'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
        'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
        'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite'
      };
      
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = modelNames[model] || model;
        elements.googleAiModel.appendChild(option);
      });
      
      // Restore previous selection if it still exists
      if (models.includes(currentModel)) {
        elements.googleAiModel.value = currentModel;
      }
    }
  } catch (error) {
    console.error('Error loading Google AI models:', error);
  }
}

// AI Conversation Functions
async function loadAIStatus() {
  if (!state.sessionId) return;
  
  try {
    const response = await fetch(`/api/ai/status/${encodeURIComponent(state.sessionId)}`);
    const status = await response.json();
    updateAIToggleButton(status.enabled);
  } catch (error) {
    console.error('Error loading AI status:', error);
  }
}

async function toggleAI() {
  if (!state.sessionId) {
    alert('Conecte-se ao WhatsApp primeiro');
    return;
  }
  
  try {
    elements.aiToggleBtn.disabled = true;
    
    const response = await fetch(`/api/ai/toggle/${encodeURIComponent(state.sessionId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      updateAIToggleButton(result.enabled);
      showNotification(result.message, result.enabled ? 'success' : 'info');
    } else {
      showNotification('Erro ao alterar status da IA', 'error');
    }
  } catch (error) {
    console.error('Error toggling AI:', error);
    showNotification('Erro ao alterar status da IA', 'error');
  } finally {
    elements.aiToggleBtn.disabled = false;
  }
}

function updateAIToggleButton(enabled) {
  if (enabled) {
    elements.aiToggleBtn.classList.add('ai-active');
    elements.aiToggleBtn.title = 'Desligar IA';
  } else {
    elements.aiToggleBtn.classList.remove('ai-active');
    elements.aiToggleBtn.title = 'Ligar IA';
  }
}

function showNotification(message, type = 'info') {
  // Implementar notificação visual
  console.log(`[${type.toUpperCase()}] ${message}`);
}

async function boot() {
  try {
    renderMessages();
    setConnectionVisual("idle");

    // Connection
    addEventListenerSafe(elements.connectBtn, "click", async () => {
      // Use fixed session ID for internal control
      const sessionId = state.currentTenant?.sessionId || state.sessionId || "default";

      await handleAsyncError(startSessionConnection(sessionId));
    });

    // Message input auto-resize
    addEventListenerSafe(elements.messageInput, "input", () => {
      autoResizeTextarea();
    });

    // Send message
    addEventListenerSafe(elements.sendBtn, "click", async (event) => {
      event.preventDefault();
      await handleAsyncError(sendMessage(event));
    });

    // Enter to send (Shift+Enter for new line)
    addEventListenerSafe(elements.messageInput, "keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements.sendBtn.click();
      }
    });

    // Emoji picker
    addEventListenerSafe(elements.emojiBtn, "click", showEmojiPicker);
    addEventListenerSafe(elements.closeEmojiBtn, "click", hideAllMenus);

    // Emoji categories
    document.querySelectorAll('.emoji-category').forEach(btn => {
      addEventListenerSafe(btn, 'click', () => {
        document.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEmojiCategory = btn.dataset.category;
        renderEmojiGrid(currentEmojiCategory);
      });
    });

    // Attach menu
    addEventListenerSafe(elements.attachBtn, "click", showAttachMenu);
    addEventListenerSafe(elements.closeAttachBtn, "click", hideAllMenus);

    // File uploads
    addEventListenerSafe(elements.attachImageBtn, "click", () => {
      elements.imageFileInput.click();
    });

    addEventListenerSafe(elements.attachVideoBtn, "click", () => {
      elements.videoFileInput.click();
    });

    addEventListenerSafe(elements.attachDocumentBtn, "click", () => {
      elements.documentFileInput.click();
    });

    addEventListenerSafe(elements.attachAudioBtn, "click", () => {
      elements.audioFileInput.click();
    });

    addEventListenerSafe(elements.imageFileInput, "change", (e) => {
      const file = e.target.files[0];
      if (file) handleAsyncError(handleFileUpload(file, 'image'));
    });

    addEventListenerSafe(elements.videoFileInput, "change", (e) => {
      const file = e.target.files[0];
      if (file) handleAsyncError(handleFileUpload(file, 'video'));
    });

    addEventListenerSafe(elements.documentFileInput, "change", (e) => {
      const file = e.target.files[0];
      if (file) handleAsyncError(handleFileUpload(file, 'document'));
    });

    addEventListenerSafe(elements.audioFileInput, "change", (e) => {
      const file = e.target.files[0];
      if (file) handleAsyncError(handleFileUpload(file, 'audio'));
    });

    // Voice recording
    addEventListenerSafe(elements.voiceBtn, "mousedown", startVoiceRecording);
    addEventListenerSafe(elements.voiceBtn, "mouseup", stopVoiceRecording);
    addEventListenerSafe(elements.voiceBtn, "mouseleave", stopVoiceRecording);
    addEventListenerSafe(elements.voiceBtn, "touchstart", (e) => {
      e.preventDefault();
      startVoiceRecording();
    });
    addEventListenerSafe(elements.voiceBtn, "touchend", (e) => {
      e.preventDefault();
      stopVoiceRecording();
    });

    addEventListenerSafe(elements.cancelVoiceBtn, "click", cancelVoiceRecording);
    addEventListenerSafe(elements.sendVoiceBtn, "click", () => {
      stopVoiceRecording();
    });

    // Business options
    addEventListenerSafe(elements.businessToggleBtn, "click", showBusinessOptions);
    addEventListenerSafe(elements.closeBusinessBtn, "click", hideAllMenus);

    addEventListenerSafe(elements.interactiveBtn, "click", () => {
      setupBusinessMessage('interactive');
    });

    addEventListenerSafe(elements.listBtn, "click", () => {
      setupBusinessMessage('list');
    });

    addEventListenerSafe(elements.locationBtn, "click", () => {
      setupBusinessMessage('location');
    });

    addEventListenerSafe(elements.productBtn, "click", () => {
      setupBusinessMessage('product');
    });

    // Chat search
    addEventListenerSafe(elements.chatSearchInput, "input", () => {
      debouncedSearch();
    });

    // Google AI API Key debounce for loading models
    let googleAiKeyTimeout;
    addEventListenerSafe(elements.googleAiApiKey, "input", () => {
      clearTimeout(googleAiKeyTimeout);
      const apiKey = elements.googleAiApiKey.value.trim();
      
      if (apiKey.length > 10) { // Only trigger if API key seems complete
        googleAiKeyTimeout = setTimeout(() => {
          handleAsyncError(loadGoogleAIModels());
        }, 1500); // Wait 1.5 seconds after user stops typing
      }
    });

    addEventListenerSafe(elements.teamBtn, "click", () => {
      window.location.href = '/admin';
    });

    
    // Logout
    addEventListenerSafe(elements.logoutBtn, "click", async () => {
      if (confirm('Tem certeza que deseja encerrar sua sessão neste navegador?')) {
        await handleAsyncError(logout());
      }
    });

    // AI Configuration Modal
    addEventListenerSafe(elements.aiConfigBtn, "click", showAiConfigModal);
    addEventListenerSafe(elements.closeAiConfigBtn, "click", hideAiConfigModal);
    addEventListenerSafe(elements.cancelAiConfigBtn, "click", hideAiConfigModal);
    addEventListenerSafe(elements.saveAiConfigBtn, "click", () => {
      handleAsyncError(saveAiConfig());
    });
    addEventListenerSafe(elements.testChatSendBtn, "click", () => {
      handleAsyncError(sendTestMessage());
    });
    addEventListenerSafe(elements.testChatInput, "keypress", (e) => {
      if (e.key === "Enter") {
        handleAsyncError(sendTestMessage());
      }
    });
    
    // Group Settings toggle
    addEventListenerSafe(elements.groupAiEnabled, "change", (e) => {
      toggleGroupOptions(e.target.checked);
    });
    addEventListenerSafe(elements.testGoogleAiBtn, "click", () => {
      handleAsyncError(testGoogleAiConnection());
    });

    // AI Toggle
    addEventListenerSafe(elements.aiToggleBtn, "click", () => {
      handleAsyncError(toggleAI());
    });

    // AI Provider switch
    elements.aiProviderRadios.forEach(radio => {
      addEventListenerSafe(radio, "change", (e) => {
        switchAiProvider(e.target.value);
      });
    });

    // Close menus when clicking outside
    addEventListenerSafe(document, "click", (event) => {
      if (!event.target.closest('.message-composer') && !event.target.closest('.modal')) {
        hideAllMenus();
      }
    });

    // Check authentication first
    await checkAuthentication();

    // Get user's unique session ID
    const userData = await handleAsyncError(callApi("/api/auth/me"));
    if (userData && userData.sessionId) {
      state.currentUser = userData.user;
      state.currentTenant = userData.tenant;
      state.sessionId = userData.sessionId;
      updateIdentityLabels(userData.sessionId);
      elements.teamBtn.classList.toggle('hidden', !(hasPermission('team:manage') || hasPermission('tenant:manage')));
      elements.aiConfigBtn.classList.toggle('hidden', !hasPermission('ai:manage'));
      elements.aiToggleBtn.classList.toggle('hidden', !hasPermission('ai:manage'));
      
      // Auto-start session with user's unique session ID
      await handleAsyncError(startSessionConnection(userData.sessionId));
    } else {
      // Fallback to original logic
      const sessions = await handleAsyncError(callApi("/sessions"));
      if (sessions) {
        const preferredSessionId =
          sessions.active?.[0] ||
          sessions.stored?.[0] ||
          state.currentTenant?.sessionId || "default";
        await handleAsyncError(startSessionConnection(preferredSessionId));
      }
    }
  } catch (error) {
    console.error('Boot error:', error);
    showToast('Erro ao inicializar aplicação', 'error');
  }
}

async function saveAiConfig() {
  try {
    const provider = document.querySelector('input[name="ai-provider"]:checked').value;

    const config = {
      provider,
      googleAI: provider === 'google-ai' ? {
        apiKey: elements.googleAiApiKey.value.trim(),
        model: elements.googleAiModel.value,
        temperature: parseFloat(elements.googleAiTemperature.value),
        maxTokens: parseInt(elements.googleAiMaxTokens.value)
      } : undefined,
      botContext: {
        systemPrompt: elements.systemPrompt.value.trim(),
        maxHistoryLength: parseInt(elements.maxHistoryLength.value)
      },
      groupSettings: {
        enabled: elements.groupAiEnabled.checked,
        respondToMentions: elements.respondToMentions.checked,
        respondToCommands: elements.respondToCommands.checked,
        commandPrefix: elements.commandPrefix.value.trim() || '!'
      }
    };

    await callApi('/api/ai/config', {
      method: 'POST',
      body: JSON.stringify(config)
    });

    showConfigStatus('Configuração salva com sucesso!', 'success');
    setTimeout(hideAiConfigModal, 2000);
  } catch (error) {
    console.error('Error saving AI config:', error);
    showConfigStatus('Erro ao salvar configuração', 'error');
  }
}

async function sendTestMessage() {
  const message = elements.testChatInput.value.trim();
  if (!message) return;

  addTestMessage(message, 'user');
  elements.testChatInput.value = '';

  try {
    const config = await getCurrentBotConfig();
    const data = await callApi('/api/ai/test-chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        config
      })
    });

    addTestMessage(data.response, 'bot');
  } catch (error) {
    console.error('Error testing chat:', error);
    addTestMessage('Erro de conexão com o servidor', 'bot', true);
  }
}

async function testGoogleAiConnection() {
  const apiKey = elements.googleAiApiKey.value.trim();
  const model = elements.googleAiModel.value;

  if (!apiKey) {
    showConfigStatus('API Key é obrigatória', 'error');
    return;
  }

  try {
    elements.testGoogleAiBtn.disabled = true;
    elements.testGoogleAiBtn.textContent = 'Testando...';
    hideConfigStatus();

    const result = await callApi('/api/ai/test-google-ai', {
      method: 'POST',
      body: JSON.stringify({ apiKey, model })
    });

    if (result.valid) {
      showConfigStatus('Conexão com Google AI bem-sucedida!', 'success');
      await loadGoogleAIModels();
    } else {
      showConfigStatus('Falha na conexão. Verifique se a API Key está correta.', 'error');
    }
  } catch (error) {
    console.error('Error testing Google AI:', error);
    showConfigStatus('Erro ao testar conexão. Tente novamente.', 'error');
  } finally {
    elements.testGoogleAiBtn.disabled = false;
    elements.testGoogleAiBtn.textContent = 'Testar';
  }
};

loadGoogleAIModels = async function() {
  const apiKey = elements.googleAiApiKey.value.trim();

  if (!apiKey) {
    return;
  }

  try {
    const data = await callApi('/api/ai/google-ai-models', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    });

    const models = data.models || [];
    const currentModel = elements.googleAiModel.value;
    elements.googleAiModel.innerHTML = '';

    const modelNames = {
      'gemini-2.5-flash': 'Gemini 2.5 Flash (Rápido)',
      'gemini-2.5-pro': 'Gemini 2.5 Pro (Completo)',
      'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
      'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
      'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite'
    };

    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = modelNames[model] || model;
      elements.googleAiModel.appendChild(option);
    });

    if (models.includes(currentModel)) {
      elements.googleAiModel.value = currentModel;
    }
  } catch (error) {
    console.error('Error loading Google AI models:', error);
  }
};

loadAIStatus = async function() {
  if (!state.sessionId) return;

  try {
    const status = await callApi(`/api/ai/status/${encodeURIComponent(state.sessionId)}`);
    updateAIToggleButton(status.enabled);
  } catch (error) {
    console.error('Error loading AI status:', error);
  }
};

toggleAI = async function() {
  if (!state.sessionId) {
    alert('Conecte-se ao WhatsApp primeiro');
    return;
  }

  try {
    elements.aiToggleBtn.disabled = true;
    const result = await callApi(`/api/ai/toggle/${encodeURIComponent(state.sessionId)}`, {
      method: 'POST',
    });

    updateAIToggleButton(result.enabled);
    showNotification(result.message, result.enabled ? 'success' : 'info');
  } catch (error) {
    console.error('Error toggling AI:', error);
    showNotification('Erro ao alterar status da IA', 'error');
  } finally {
    elements.aiToggleBtn.disabled = false;
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  removeAllEventListeners();
  stopHistoryRefresh();
  stopConnectionPolling();
});

boot();
