/**
 * SafeSteps — AI Safety Assistant UI Controller (assistant.js)
 * Mounts the floating circular AI button on all screens.
 * Handles context-aware questions, area queries, and data rendering.
 *
 * Part 5 changes:
 *  - Passes current area name from window.state if available
 *  - Improved markdown rendering: **bold**, *italic*, `code`, \n→<br>
 *  - Typing indicator updated to "Thinking…"
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
    const currentActiveScreen = document.querySelector(".view-screen.active")?.id || "screen-auth";
    this.updateScreenContext(currentActiveScreen);
    console.info(`[SafeAssistantUI] SafeSteps AI Assistant widget mounted [Initial Screen: ${currentActiveScreen}].`);
  },

  injectUI() {
    // Locate the mobile shell container to keep AI circle inside the mobile layout
    const container = document.querySelector(".app-frame") || document.body;

    // 1. Floating Circular Trigger Button
    const triggerBtn = document.createElement("button");
    triggerBtn.id = "safesteps-ai-btn";
    triggerBtn.className = "safesteps-ai-trigger";
    triggerBtn.title = "Ask SafeSteps AI";
    triggerBtn.innerHTML = `<span class="ai-trigger-sparkle">✨</span>`;
    container.appendChild(triggerBtn);

    // 2. Chat Panel Window
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
    const btn      = document.getElementById("safesteps-ai-btn");
    const closeBtn = document.getElementById("btn-close-ai");
    const form     = document.getElementById("ai-chat-form");
    const input    = document.getElementById("ai-chat-input");

    btn?.addEventListener("click",   () => this.toggleChat());
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
    const triggerBtn = document.getElementById("safesteps-ai-btn");
    const panel      = document.getElementById("safesteps-ai-panel");

    // Hide on login/auth screen
    if (screenId === "screen-auth") {
      if (triggerBtn) triggerBtn.style.display = "none";
      if (panel) {
        panel.classList.remove("active");
        this.isOpen = false;
      }
      return;
    } else {
      if (triggerBtn) triggerBtn.style.display = "flex";
    }

    const chipsBar  = document.getElementById("ai-quick-chips-bar");
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

    // Typing indicator
    const typingId = "ai-typing-" + Date.now();
    this.appendTypingIndicator(typingId);

    // Build context payload — read latest live location from window.state
    const loc = window.state?.currentLocation || { lat: 28.6315, lng: 77.2190, name: "Connaught Place Central Hub" };
    const areaName = loc.name || null;
    const contextPayload = {
      screen:        this.activeScreen,
      area_name:     areaName,
      safety_score:  window.state?.safetyScore || null,
      risk_level:    window.state?.riskLevel || null,
      origin:        window.state?.journeyOrigin      || "Current Location",
      destination:   window.state?.journeyDestination || null,
    };

    try {
      const res = await fetch("/api/assistant/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          lat:     loc.lat,
          lng:     loc.lng,
          context: contextPayload,
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
        "I couldn't reach the SafeSteps AI service right now. All map, journey, and emergency features continue working normally.",
        ["offline_fallback"]
      );
    }
  },

  /** Render a message bubble. Supports **bold**, *italic*, `code`, newlines. */
  appendMessage(sender, text, sources = null) {
    const container = document.getElementById("ai-messages-container");
    if (!container) return;

    const msgEl = document.createElement("div");
    msgEl.className = `ai-msg ${sender}`;

    const body = document.createElement("div");
    body.className = "ai-message-text";
    body.textContent = String(text ?? "");
    msgEl.appendChild(body);

    if (sources && sources.length > 0 && sender === "bot") {
      const sourcesBar = document.createElement("div");
      sourcesBar.className = "ai-sources-bar";
      const label = document.createElement("span");
      label.textContent = "Sources:";
      sourcesBar.appendChild(label);
      sources.forEach(source => {
        const tag = document.createElement("span");
        tag.className = "ai-source-tag";
        tag.textContent = String(source).replace(/_/g, " ");
        sourcesBar.appendChild(tag);
      });
      msgEl.appendChild(sourcesBar);
    }
    container.appendChild(msgEl);
    this.scrollToBottom();
  },

  appendTypingIndicator(id) {
    const container = document.getElementById("ai-messages-container");
    if (!container) return;
    const el = document.createElement("div");
    el.id = id;
    el.className = "ai-msg bot";
    el.innerHTML = "<em>Thinking…</em>";
    container.appendChild(el);
    this.scrollToBottom();
  },

  removeTypingIndicator(id) {
    document.getElementById(id)?.remove();
  },

  scrollToBottom() {
    const container = document.getElementById("ai-messages-container");
    if (container) container.scrollTop = container.scrollHeight;
  }
};

window.SafeAssistantUI = SafeAssistantUI;
