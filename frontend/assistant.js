/**
 * SafeSteps — AI Safety Assistant UI Controller (assistant.js)
 * Mounts the floating 30px circular AI button on all screens
 * Handles context-aware questions, area queries, and data rendering
 */

const SafeAssistantUI = {
  isOpen: false,
  activeScreen: "home",

  // Context-sensitive quick suggestions mapped to screens
  screenSuggestions: {
    "screen-home": [
      "Tell me about this area",
      "How does SafeSteps work?",
      "What is my safety score?"
    ],
    "screen-map": [
      "Is this area safe?",
      "What are these hotspots?",
      "Why is this zone High Risk?"
    ],
    "screen-journey": [
      "Check my journey",
      "Is my destination safe?",
      "Explain Safer Route vs Fastest"
    ],
    "screen-intelligence": [
      "Find similar reports",
      "What issues are reported nearby?",
      "How does complaint AI categorize?"
    ],
    "screen-emergency": [
      "Explain Emergency workflow",
      "How to cancel emergency with PIN?",
      "What happens to my guardians?"
    ]
  },

  init() {
    this.injectUI();
    this.bindEvents();
    this.updateScreenContext("screen-home");
    console.info("[SafeAssistantUI] SafeSteps AI Assistant widget mounted.");
  },

  injectUI() {
    // Locate the mobile shell container (.app-frame) to ensure the AI circle stays inside the mobile layout
    const container = document.querySelector(".app-frame") || document.body;

    // 1. Floating 30px Circular Trigger Button inside mobile app-frame
    const triggerBtn = document.createElement("button");
    triggerBtn.id = "safesteps-ai-btn";
    triggerBtn.className = "safesteps-ai-trigger";
    triggerBtn.title = "Ask SafeSteps AI";
    triggerBtn.innerHTML = `
      <span class="ai-trigger-sparkle">✨</span>
    `;
    container.appendChild(triggerBtn);

    // 2. Chat Panel Window inside mobile app-frame
    const chatWindow = document.createElement("div");
    chatWindow.id = "safesteps-ai-panel";
    chatWindow.className = "safesteps-ai-window";
    chatWindow.innerHTML = `
      <div class="ai-header">
        <div class="ai-title-wrap">
          <span class="ai-status-indicator"></span>
          <span class="ai-header-title">SafeSteps AI</span>
          <span class="ai-header-subtitle">Safety Guide</span>
        </div>
        <button class="ai-close-btn" id="btn-close-ai" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="ai-messages-list" id="ai-messages-container">
        <div class="ai-msg bot">
          <p>Hi, I'm <strong>SafeSteps AI</strong>.</p>
          <p>Ask me about an area's safety, nearby hotspots, past reports, safer routes, or how SafeSteps features work.</p>
        </div>
      </div>

      <div class="ai-quick-chips" id="ai-quick-chips-bar"></div>

      <form class="ai-input-bar" id="ai-chat-form">
        <input type="text" class="ai-input-field" id="ai-chat-input" placeholder="Ask SafeSteps anything..." autocomplete="off" />
        <button type="submit" class="ai-send-btn" title="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    `;
    container.appendChild(chatWindow);
  },

  bindEvents() {
    const btn = document.getElementById("safesteps-ai-btn");
    const closeBtn = document.getElementById("btn-close-ai");
    const form = document.getElementById("ai-chat-form");
    const input = document.getElementById("ai-chat-input");

    btn?.addEventListener("click", () => this.toggleChat());
    closeBtn?.addEventListener("click", () => this.closeChat());

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      this.sendMessage(text);
    });
  },

  toggleChat() {
    this.isOpen = !this.isOpen;
    const panel = document.getElementById("safesteps-ai-panel");
    if (panel) {
      panel.classList.toggle("active", this.isOpen);
      if (this.isOpen) {
        document.getElementById("ai-chat-input")?.focus();
        this.scrollToBottom();
      }
    }
  },

  closeChat() {
    this.isOpen = false;
    document.getElementById("safesteps-ai-panel")?.classList.remove("active");
  },

  updateScreenContext(screenId) {
    this.activeScreen = screenId;
    const chipsBar = document.getElementById("ai-quick-chips-bar");
    if (!chipsBar) return;

    const suggestions = this.screenSuggestions[screenId] || this.screenSuggestions["screen-home"];
    chipsBar.innerHTML = suggestions
      .map(s => `<button type="button" class="ai-chip" data-query="${s}">${s}</button>`)
      .join("");

    chipsBar.querySelectorAll(".ai-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const query = chip.getAttribute("data-query");
        this.sendMessage(query);
      });
    });
  },

  async sendMessage(userText) {
    this.appendMessage("user", userText);

    // Typing / Thinking Indicator
    const typingId = "ai-typing-" + Date.now();
    this.appendTypingIndicator(typingId);

    // Build Context payload
    const coords = window.state?.currentLocation || { lat: 28.6315, lng: 77.2190 };
    const contextPayload = {
      screen: this.activeScreen,
      origin: "Connaught Place Metro",
      destination: "Karol Bagh Residence"
    };

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          lat: coords.lat,
          lng: coords.lng,
          context: contextPayload
        })
      });

      const data = await res.json();
      this.removeTypingIndicator(typingId);
      this.appendMessage("bot", data.reply, data.sources);
    } catch (err) {
      console.warn("[SafeAssistantUI] Assistant query error:", err);
      this.removeTypingIndicator(typingId);
      this.appendMessage(
        "bot",
        "I couldn't reach the SafeSteps data service right now. All standard map, journey, and emergency features continue working normally.",
        ["offline_fallback"]
      );
    }
  },

  appendMessage(sender, text, sources = null) {
    const container = document.getElementById("ai-messages-container");
    if (!container) return;

    const msgEl = document.createElement("div");
    msgEl.className = `ai-msg ${sender}`;

    // Format simple bold/markdown lines
    let formattedText = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br/>");

    let sourcesHtml = "";
    if (sources && sources.length > 0 && sender === "bot") {
      sourcesHtml = `
        <div class="ai-sources-bar">
          <span>Sources:</span>
          ${sources.map(s => `<span class="ai-source-tag">${s.replace('_', ' ')}</span>`).join("")}
        </div>
      `;
    }

    msgEl.innerHTML = `<div>${formattedText}</div>${sourcesHtml}`;
    container.appendChild(msgEl);
    this.scrollToBottom();
  },

  appendTypingIndicator(id) {
    const container = document.getElementById("ai-messages-container");
    if (!container) return;
    const el = document.createElement("div");
    el.id = id;
    el.className = "ai-msg bot";
    el.innerHTML = "<em>Analyzing SafeSteps data...</em>";
    container.appendChild(el);
    this.scrollToBottom();
  },

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    el?.remove();
  },

  scrollToBottom() {
    const container = document.getElementById("ai-messages-container");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
};

window.SafeAssistantUI = SafeAssistantUI;
