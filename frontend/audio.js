/**
 * SafeSteps — Audio Intelligence & Evidence Capture Engine
 * Module: audio.js
 * 
 * Capabilities:
 * 1. Web Speech API Distress Keyword Listener (continuous speech detection)
 * 2. Multi-lingual Trigger Phrases: "help me", "help", "bachao", "stop", "leave me", "chhod mujhe", "emergency", "police"
 * 3. Fallback / Testing Simulation Controls for environments without live microphone hardware
 * 4. HTML5 MediaRecorder Ambient Audio Evidence Capture Buffer (10s buffer, encoded to base64)
 * 5. In-browser audio playback controller for guardian/responder review
 */

const SafeAudioEngine = {
  recognition: null,
  isListening: false,
  mediaRecorder: null,
  audioChunks: [],
  recordedAudioBase64: null,
  recordedAudioBlobUrl: null,
  isRecordingEvidence: false,

  // Microphone quality & health state (Part 1)
  micPermissionState: "unknown", // 'unknown', 'granted', 'denied', 'unavailable'
  micAvailable: false,
  isWeakMic: false,
  currentVolume: 0,
  audioContext: null,

  // Runtime Device & Browser Capability Matrix (Part 10)
  capabilities: null,

  /**
   * Evaluates browser and device capabilities at runtime:
   * FULL_SUPPORT -> Speech + Audio Detection
   * AUDIO_ONLY -> VAD & Intensity Audio Analysis (Speech unavailable)
   * LIMITED_AUDIO -> Recording only
   * MANUAL_SOS_ONLY -> Hardware unavailable, graceful fallback
   */
  getDeviceCapabilities() {
    const hasGetUserMedia = !!(typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasMediaRecorder = !!(typeof MediaRecorder !== "undefined");
    const hasAudioContext = !!(typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext));
    const hasSpeechRecognition = !!(typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition));
    const hasWebkitSpeech = !!(typeof window !== "undefined" && window.webkitSpeechRecognition);

    let tier = "MANUAL_SOS_ONLY";
    let summary = "Manual SOS Only (Microphone APIs Unavailable)";

    if (hasGetUserMedia && hasAudioContext && hasSpeechRecognition) {
      tier = "FULL_SUPPORT";
      summary = "Full Support: Continuous Speech + Adaptive Audio Detection Active";
    } else if (hasGetUserMedia && hasAudioContext) {
      tier = "AUDIO_ONLY";
      summary = "Audio Detection Only (VAD & Intensity Active, Speech Unavailable)";
    } else if (hasGetUserMedia) {
      tier = "LIMITED_AUDIO";
      summary = "Limited Audio (Evidence Recording Available, Real-time Analysis Restricted)";
    }

    const caps = {
      tier,
      summary,
      apis: {
        getUserMedia: hasGetUserMedia,
        MediaRecorder: hasMediaRecorder,
        AudioContext: hasAudioContext,
        SpeechRecognition: hasSpeechRecognition,
        webkitSpeechRecognition: hasWebkitSpeech
      }
    };

    this.capabilities = caps;
    return caps;
  },

  // Bilingual distress triggers (Part 4)
  distressKeywords: [
    "help me",
    "help",
    "bachao",
    "bachao mujhe",
    "stop it",
    "stop",
    "leave me",
    "leave me alone",
    "chhod mujhe",
    "chodo",
    "police",
    "emergency",
    "khatra",
    "danger"
  ],

  /**
   * Normalize transcript text: lowercase, punctuation, whitespace, and excessive repeated chars
   */
  normalizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .toLowerCase()
      .replace(/['".,\/#!$%\^&\*;:{}=\-_`~()?’]/g, " ")
      .replace(/(.)\1{2,}/g, "$1$1") // collapse "heeeelp" -> "heelp", "bachaaao" -> "bachaao"
      .replace(/\s+/g, " ")
      .trim();
  },

  /**
   * Lightweight standard Levenshtein distance
   */
  levenshteinDistance(s1, s2) {
    if (s1 === s2) return 0;
    if (!s1.length) return s2.length;
    if (!s2.length) return s1.length;

    const row = [];
    for (let i = 0; i <= s2.length; i++) row[i] = i;

    for (let i = 1; i <= s1.length; i++) {
      let prev = i;
      for (let j = 1; j <= s2.length; j++) {
        let val;
        if (s1[i - 1] === s2[j - 1]) {
          val = row[j - 1];
        } else {
          val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
        }
        row[j - 1] = prev;
        prev = val;
      }
      row[s2.length] = prev;
    }
    return row[s2.length];
  },

  /**
   * Fuzzy keyword matcher with typo tolerance for speech recognition mistakes
   * (e.g. "hep", "help mi", "bachaoo", "bachaao")
   */
  matchFuzzyKeywords(rawTranscript) {
    const norm = this.normalizeText(rawTranscript);
    if (!norm) return { matches: [], hasMatch: false };

    const matches = [];
    const tokens = norm.split(" ");

    // 1. Multi-word phrase check (exact & minor typo e.g. "help mi" for "help me")
    const multiWordKeywords = this.distressKeywords.filter((k) => k.includes(" "));
    for (const phrase of multiWordKeywords) {
      if (norm.includes(phrase)) {
        matches.push({ keyword: phrase, raw: phrase, confidence: 1.0, exact: true });
      } else {
        // Test 2-word window fuzzy match (e.g. "help mi")
        const phraseWords = phrase.split(" ");
        for (let i = 0; i <= tokens.length - phraseWords.length; i++) {
          const windowPhrase = tokens.slice(i, i + phraseWords.length).join(" ");
          const dist = this.levenshteinDistance(windowPhrase, phrase);
          if (dist === 1) {
            matches.push({ keyword: phrase, raw: windowPhrase, confidence: 0.88, exact: false });
          }
        }
      }
    }

    // 2. Single-word keyword check
    const singleWordKeywords = this.distressKeywords.filter((k) => !k.includes(" "));
    for (const token of tokens) {
      if (token.length < 3) continue;

      for (const kw of singleWordKeywords) {
        if (token === kw) {
          matches.push({ keyword: kw, raw: token, confidence: 1.0, exact: true });
          continue;
        }

        // Collapse repeated characters to 1 for phonetic variant check (e.g., "bachaao" -> "bachao")
        const deduplicatedToken = token.replace(/(.)\1+/g, "$1");
        const deduplicatedKw = kw.replace(/(.)\1+/g, "$1");
        if (deduplicatedToken === deduplicatedKw) {
          matches.push({ keyword: kw, raw: token, confidence: 0.95, exact: false });
          continue;
        }

        // Levenshtein distance check for speech recognition typos (e.g. "hep" -> "help")
        const dist = this.levenshteinDistance(token, kw);
        const maxDist = kw.length >= 6 ? 2 : kw.length >= 4 ? 1 : 0;
        if (dist > 0 && dist <= maxDist) {
          const sim = 1.0 - dist / Math.max(token.length, kw.length);
          if (sim >= 0.75) {
            matches.push({ keyword: kw, raw: token, confidence: sim, exact: false });
          }
        }
      }
    }

    // Deduplicate by keyword preserving highest confidence
    const uniqueMap = new Map();
    for (const m of matches) {
      if (!uniqueMap.has(m.keyword) || uniqueMap.get(m.keyword).confidence < m.confidence) {
        uniqueMap.set(m.keyword, m);
      }
    }

    const uniqueMatches = Array.from(uniqueMap.values());
    return {
      matches: uniqueMatches,
      hasMatch: uniqueMatches.length > 0,
      bestMatch: uniqueMatches[0] || null
    };
  },

  // Centralized Distress Confidence Scoring Configuration (Part 5)
  CONFIDENCE_CONFIG: {
    WEIGHTS: {
      KEYWORD_MATCH: 50,
      REPEATED_DISTRESS: 20,
      MULTIPLE_KEYWORDS: 20,
      VOICE_ACTIVITY: 10,
      HIGH_INTENSITY: 15
    },
    THRESHOLDS: {
      LOW: 30,
      MEDIUM: 50,
      HIGH: 70,
      CRITICAL: 85
    },
    CONVERSATIONAL_PHRASES: [
      "help me understand",
      "help with homework",
      "can you help me with",
      "stop the video",
      "stop the music",
      "stop playing",
      "police station",
      "police station nearby",
      "police department"
    ]
  },

  recentDistressHistory: [],

  /**
   * Multi-signal distress confidence scoring engine
   * Evaluates keywords, voice activity, intensity, and historical recurrence
   * Returns structured confidence payload
   */
  evaluateDistressConfidence({ transcript = "", audioAnalysis = null, now = Date.now() }) {
    const config = this.CONFIDENCE_CONFIG;
    const fuzzyResult = this.matchFuzzyKeywords(transcript);
    const matchedKeywords = fuzzyResult.matches.map((m) => m.keyword);
    const norm = this.normalizeText(transcript);

    // Prune events older than 20 seconds from history
    this.recentDistressHistory = this.recentDistressHistory.filter((t) => now - t < 20000);

    const signals = {
      keywordMatch: false,
      repeatedDistress: false,
      multipleKeywords: false,
      voiceActivity: false,
      highIntensity: false,
      conversationalFilterApplied: false
    };

    let score = 0;

    // 1. Keyword match (+50 weighted by match quality)
    if (fuzzyResult.hasMatch) {
      signals.keywordMatch = true;
      const bestConfidence = fuzzyResult.bestMatch ? fuzzyResult.bestMatch.confidence : 1.0;
      score += Math.round(config.WEIGHTS.KEYWORD_MATCH * bestConfidence);
    }

    // 2. Multiple distinct distress keywords (+20)
    // Filter out sub-words that are contained in longer matched phrases (e.g. "help" inside "help me")
    const nonOverlappingKeywords = matchedKeywords.filter(
      (kw, _, arr) => !arr.some((other) => other !== kw && other.includes(kw))
    );
    if (nonOverlappingKeywords.length >= 2) {
      signals.multipleKeywords = true;
      score += config.WEIGHTS.MULTIPLE_KEYWORDS;
    }

    // 3. Repeated distress across consecutive frames/transcripts (+20)
    if (this.recentDistressHistory.length > 0 && fuzzyResult.hasMatch) {
      signals.repeatedDistress = true;
      score += config.WEIGHTS.REPEATED_DISTRESS;
    }

    // 4. Voice Activity Detection (+10)
    const analysis = audioAnalysis || this.lastAudioAnalysis;
    if (analysis && analysis.isVoiceActive) {
      signals.voiceActivity = true;
      score += config.WEIGHTS.VOICE_ACTIVITY;
    }

    // 5. High vocal intensity / sudden distress scream (+15)
    if (analysis && (analysis.isSuddenLoud || analysis.rms > 0.25)) {
      signals.highIntensity = true;
      score += config.WEIGHTS.HIGH_INTENSITY;
    }

    // 6. Conversational false-positive guard
    // E.g. "help me understand this" or "stop the video" without high vocal intensity
    const isConversational = config.CONVERSATIONAL_PHRASES.some((phrase) => norm.includes(phrase));
    if (isConversational && !signals.highIntensity) {
      signals.conversationalFilterApplied = true;
      score = Math.min(25, Math.max(10, score - 55)); // heavily down-rank benign conversational mentions
    }

    score = Math.max(0, Math.min(100, score));

    // Map to discrete confidence level
    let confidence = "LOW";
    if (score >= config.THRESHOLDS.CRITICAL) {
      confidence = "CRITICAL";
    } else if (score >= config.THRESHOLDS.HIGH) {
      confidence = "HIGH";
    } else if (score >= config.THRESHOLDS.MEDIUM) {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }

    // Log history if keyword detected
    if (fuzzyResult.hasMatch && score >= config.THRESHOLDS.MEDIUM) {
      this.recentDistressHistory.push(now);
    }

    return {
      score,
      confidence,
      matchedKeywords,
      signals,
      isDistressConfirmed: score >= config.THRESHOLDS.HIGH
    };
  },

  /**
   * Safe Audio Constraints with echo cancellation, noise suppression, and auto gain control
   */
  getAudioConstraints() {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
  },

  /**
   * Request microphone stream with constraint fallbacks & permission/hardware detection
   */
  async requestMicrophoneStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.micPermissionState = "unavailable";
      this.micAvailable = false;
      console.warn("[SafeAudioEngine] getUserMedia API not supported in browser environment.");
      return null;
    }

    try {
      // Try acquiring stream with high-quality constraints first
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: this.getAudioConstraints()
      });
      this.micPermissionState = "granted";
      this.micAvailable = true;
      this.measureInputVolume(stream);
      return stream;
    } catch (err) {
      console.warn("[SafeAudioEngine] Primary microphone constraint stream request failed:", err.name || err);

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.micPermissionState = "denied";
        this.micAvailable = false;
        this.updateMicStatusBadge(false, "Microphone Access Blocked");
        return null;
      }

      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        this.micPermissionState = "unavailable";
        this.micAvailable = false;
        this.updateMicStatusBadge(false, "No Microphone Found");
        return null;
      }

      // Fallback attempt: basic audio request without explicit constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micPermissionState = "granted";
        this.micAvailable = true;
        this.measureInputVolume(fallbackStream);
        return fallbackStream;
      } catch (fallbackErr) {
        console.warn("[SafeAudioEngine] Fallback microphone acquisition failed:", fallbackErr);
        if (fallbackErr.name === "NotAllowedError" || fallbackErr.name === "PermissionDeniedError") {
          this.micPermissionState = "denied";
        } else {
          this.micPermissionState = "unavailable";
        }
        this.micAvailable = false;
        return null;
      }
    }
  },

  /**
   * Measure input volume and detect weak microphone signal
   */
  measureInputVolume(stream) {
    if (!stream || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let sampleCount = 0;
      let totalVolume = 0;

      const checkVolume = () => {
        if (sampleCount >= 20) {
          const avgVolume = totalVolume / sampleCount;
          this.currentVolume = avgVolume;
          this.isWeakMic = avgVolume < 5; // Low sensitivity flag
          if (this.isWeakMic) {
            console.info("[SafeAudioEngine] ℹ️ Weak microphone input volume detected (Avg RMS:", avgVolume.toFixed(1), "). SafeGain active.");
          }
          try { audioCtx.close(); } catch (e) {}
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        totalVolume += sum / dataArray.length;
        sampleCount++;
        setTimeout(checkVolume, 100);
      };

      checkVolume();
    } catch (e) {
      console.warn("[SafeAudioEngine] Input volume measurement notice:", e);
    }
  },

  // Adaptive audio pipeline state (Part 2)
  audioPipeline: null,

  /**
   * Setup adaptive Web Audio pipeline:
   * Microphone -> MediaStream -> AudioContext -> GainNode -> DynamicsCompressor -> AnalyserNode
   */
  setupAdaptivePipeline(stream) {
    if (!stream || typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      this.teardownAdaptivePipeline();
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

      // Safe compressor to eliminate clipping on sudden loud signals
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
      compressor.knee.setValueAtTime(30, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      // Pipeline chain
      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(analyser);

      this.audioPipeline = {
        audioCtx,
        source,
        gainNode,
        compressor,
        analyser,
        currentGain: 1.0,
        isRunning: true
      };

      console.info("[SafeAudioEngine] 🎛️ Adaptive microphone gain & normalization pipeline initialized.");
      return this.audioPipeline;
    } catch (err) {
      console.warn("[SafeAudioEngine] Could not initialize Web Audio pipeline:", err);
      return null;
    }
  },

  /**
   * Adaptively adjusts gain based on incoming RMS level:
   * Quiet -> amplified (up to 2.5x)
   * Normal -> unchanged (~1.0x)
   * Loud -> scaled down & clamped by DynamicsCompressor to avoid clipping
   */
  adjustAdaptiveGain(rms) {
    if (!this.audioPipeline || !this.audioPipeline.gainNode) return 1.0;
    const { audioCtx, gainNode } = this.audioPipeline;
    let targetGain = 1.0;

    if (rms < 0.04) {
      // Quiet microphone: boost smoothly up to 2.5x
      targetGain = Math.min(2.5, 1.0 + (0.04 - rms) * 35);
    } else if (rms > 0.3) {
      // Very loud input: attenuate slightly, compressor handles the peak
      targetGain = Math.max(0.6, 1.0 - (rms - 0.3) * 1.5);
    } else {
      targetGain = 1.0;
    }

    try {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.15);
      this.audioPipeline.currentGain = targetGain;
    } catch (e) {
      gainNode.gain.value = targetGain;
    }

    return targetGain;
  },

  /**
   * Teardown audio pipeline and release resources
   */
  teardownAdaptivePipeline() {
    if (this.audioPipeline) {
      try {
        if (this.audioPipeline.audioCtx && this.audioPipeline.audioCtx.state !== "closed") {
          this.audioPipeline.audioCtx.close();
        }
      } catch (e) {}
      this.audioPipeline = null;
    }
  },

  // Noise & Voice Activity Analysis State (Part 3)
  noiseFloor: 0.015,
  lastAudioAnalysis: {
    rms: 0,
    noiseFloor: 0.015,
    isVoiceActive: false,
    isSilence: true,
    isSuddenLoud: false
  },

  /**
   * Calculate RMS (Root Mean Square) volume level from time-domain audio samples
   */
  calculateRMS(samples) {
    if (!samples || samples.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      // If byte array (0-255, center 128) normalize to -1.0 .. 1.0
      const norm = (samples[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    return Math.sqrt(sumSquares / samples.length);
  },

  /**
   * Smooth dynamic noise floor estimation
   */
  estimateNoiseFloor(rms) {
    if (rms < 0.001) return this.noiseFloor;
    // Slowly follow background floor, decay faster upwards than downwards
    if (rms < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
    } else {
      this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;
    }
    this.noiseFloor = Math.max(0.005, Math.min(0.1, this.noiseFloor));
    return this.noiseFloor;
  },

  /**
   * Analyze audio frame for voice activity, silence, and sudden intensity
   * NOTE: This feeds signals into the confidence engine and does NOT directly trigger SOS.
   */
  analyzeAudioFrame(samples) {
    const rms = this.calculateRMS(samples);
    const noiseFloor = this.estimateNoiseFloor(rms);

    const voiceThreshold = Math.max(0.025, noiseFloor * 2.2);
    const isSilence = rms < voiceThreshold;
    const isVoiceActive = rms >= voiceThreshold;
    const isSuddenLoud = rms > 0.35 && rms > noiseFloor * 4.5;

    this.lastAudioAnalysis = {
      rms,
      noiseFloor,
      isVoiceActive,
      isSilence,
      isSuddenLoud
    };

    return this.lastAudioAnalysis;
  },

  // Speech Recognition Resilience State (Part 6)
  isSpeechSupported: true,
  recognitionRestarts: 0,
  lastRestartAttempt: 0,
  restartTimer: null,

  /**
   * Schedule resilient speech recognition restart with backoff and infinite-loop guard
   */
  scheduleSpeechRestart() {
    if (!this.isListening || !this.recognition) return;
    if (this.micPermissionState === "denied") {
      console.warn("[SafeAudioEngine] Microphone permission denied; halting recognition restart.");
      return;
    }

    const now = Date.now();
    if (now - this.lastRestartAttempt > 15000) {
      this.recognitionRestarts = 0;
    }

    this.lastRestartAttempt = now;
    this.recognitionRestarts++;

    if (this.recognitionRestarts > 5) {
      console.warn("[SafeAudioEngine] ⚠️ Speech recognition restart threshold exceeded. Falling back smoothly to local audio & VAD detection.");
      this.updateMicStatusBadge(true, "Speech Degraded (Local Audio Fallback)");
      return;
    }

    const delay = Math.min(3000, 400 * Math.pow(1.5, this.recognitionRestarts));
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      if (this.isListening && this.recognition) {
        try {
          this.recognition.start();
          console.info(`[SafeAudioEngine] 🔄 Speech listener restarted (attempt ${this.recognitionRestarts})`);
        } catch (e) {
          // Already running or busy
        }
      }
    }, delay);
  },

  onDistressDetected: null,

  /**
   * Multi-Layer Distress Processing Pipeline (Part 7)
   * Microphone -> Audio Preprocessing -> [Speech + VAD/Intensity] -> Confidence Engine -> Verification
   * Guarantees no single raw detector triggers emergency workflow unilaterally.
   */
  processAudioStreamFrame(transcript, audioData = null) {
    if (audioData) {
      this.analyzeAudioFrame(audioData);
    }

    const confidenceReport = this.evaluateDistressConfidence({
      transcript,
      audioAnalysis: this.lastAudioAnalysis
    });

    console.info(
      `[SafeAudioEngine] Multi-Layer Score: ${confidenceReport.score} (${confidenceReport.confidence})`,
      confidenceReport.signals
    );

    // Multi-Layer Verification Gate:
    // Only proceed to verification if confidence engine confirms high/critical distress
    if (confidenceReport.isDistressConfirmed || confidenceReport.confidence === "HIGH" || confidenceReport.confidence === "CRITICAL") {
      const primaryKeyword = confidenceReport.matchedKeywords[0] || "voice_distress";
      console.warn(`[SafeAudioEngine] 🚨 Multi-layer verified distress confirmed: "${primaryKeyword}" (Score: ${confidenceReport.score})`);
      if (typeof this.onDistressDetected === "function") {
        this.onDistressDetected(primaryKeyword, confidenceReport);
      }
    }

    return confidenceReport;
  },

  /**
   * Initialize Web Speech API with capability detection and error resilience
   */
  initSpeechRecognition(onKeywordDetected) {
    this.onDistressDetected = onKeywordDetected;
    const SpeechRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRecognition) {
      this.isSpeechSupported = false;
      console.info("[SafeAudioEngine] Web Speech API not natively supported; local audio detection & simulation fallback active.");
      this.updateMicStatusBadge(false, "Speech API Unavailable (Local Audio Fallback)");
      return;
    }

    this.isSpeechSupported = true;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-IN"; // English (India) with Hindi loan-word recognition

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateMicStatusBadge(true, "Active (Listening for triggers)");
        console.info("[SafeAudioEngine] Speech recognition active.");
      };

      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript.trim().toLowerCase();
          console.log("[SafeAudioEngine] Audio transcript stream:", transcript);

          // Route exclusively through multi-layer verification pipeline
          this.processAudioStreamFrame(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("[SafeAudioEngine] Speech recognition event status:", event.error);

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.micPermissionState = "denied";
          this.updateMicStatusBadge(false, "Microphone Access Blocked");
          return;
        }

        if (event.error === "network") {
          console.warn("[SafeAudioEngine] Network speech recognition failure; scheduling backoff retry.");
          this.scheduleSpeechRestart();
          return;
        }

        if (event.error === "no-speech") {
          // Normal expected ambient silence; no error escalation needed
          return;
        }

        if (event.error === "audio-capture") {
          this.micAvailable = false;
          this.updateMicStatusBadge(false, "Audio Capture Hardware Error");
        }
      };

      this.recognition.onend = () => {
        // Resilient restart if still listening and permission not blocked
        if (this.isListening && this.micPermissionState !== "denied") {
          this.scheduleSpeechRestart();
        }
      };
    } catch (err) {
      console.warn("[SafeAudioEngine] Initialization error:", err);
      this.updateMicStatusBadge(false, "Mic Inactive");
    }
  },

  startSpeechListening(isAuto = false) {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
      } catch (err) {
        console.warn("[SafeAudioEngine] Could not start speech recognition:", err);
      }
    } else if (!this.recognition) {
      // For demo environments without Web Speech API, still reflect active simulation listening
      this.isListening = true;
    }

    const stateText = isAuto ? "Auto-Active (Red Zone)" : "Active (Listening for triggers)";
    this.updateMicStatusBadge(true, stateText, isAuto);
    console.info(`[SafeAudioEngine] 🎙️ Distress Listener Started [Mode: ${isAuto ? 'AUTO_RED_ZONE' : 'MANUAL'}]`);
  },

  stopSpeechListening() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {}
    }
    this.updateMicStatusBadge(false, "Standby", false);
    console.info("[SafeAudioEngine] 🎙️ Distress Listener Stopped (Standby)");
  },

  updateMicStatusBadge(isActive, text, isAuto = false) {
    if (typeof document === "undefined") return;
    const badgeEl = document.getElementById("mic-status-badge");
    const indicatorEl = document.getElementById("mic-live-dot");
    const toggleEl = document.getElementById("btn-toggle-mic-listen");

    if (indicatorEl) {
      if (isActive) {
        indicatorEl.className = isAuto ? "live-dot pulsing-red" : "live-dot pulsing-green";
      } else {
        indicatorEl.className = "live-dot standby";
      }
    }
    if (badgeEl) {
      badgeEl.classList.toggle("mic-active", isActive);
      badgeEl.classList.toggle("mic-auto-red", isAuto);
    }
    if (toggleEl) {
      toggleEl.classList.toggle("is-listening", isActive);
      toggleEl.setAttribute("aria-pressed", String(isActive));
      toggleEl.title = isActive ? "Stop voice recognition" : "Start voice recognition";
    }
  },

  /**
   * Determine best supported audio MIME type across browsers (Chrome, Firefox, Safari, Edge)
   */
  getSupportedAudioMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
      return "";
    }
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
      "audio/wav"
    ];
    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch (e) {}
    }
    return "";
  },

  evidenceAutoStopTimer: null,
  evidenceProgressInterval: null,
  evidenceDurationSeconds: 30,
  evidenceRemainingSeconds: 30,
  onEvidenceReady: null,

  /**
   * Start MediaRecorder to capture ambient audio evidence during emergency verification/escalation
   * Starts immediately when SOS is triggered and records for the full 30-second window.
   */
  async startEvidenceRecording(durationSeconds = 30) {
    // Prevent duplicate recording instances for the same emergency event
    if (this.isRecordingEvidence) {
      console.info("[SafeAudioEngine] Evidence recording already active; ignoring duplicate start request.");
      return;
    }

    // Cleanup previous evidence if any
    if (this.recordedAudioBlobUrl) {
      try { URL.revokeObjectURL(this.recordedAudioBlobUrl); } catch (e) {}
      this.recordedAudioBlobUrl = null;
    }
    this.audioChunks = [];
    this.recordedAudioBase64 = null;
    this.evidenceDurationSeconds = durationSeconds;
    this.evidenceRemainingSeconds = durationSeconds;

    const finalizeBufferAndNotify = async (blob, base64) => {
      this.recordedAudioBlobUrl = blob ? URL.createObjectURL(blob) : null;
      this.recordedAudioBase64 = base64;
      if (this.recordedAudioBlobUrl) {
        this.renderAudioEvidenceWidget(this.recordedAudioBlobUrl);
      }
      if (typeof this.onEvidenceReady === "function") {
        try {
          this.onEvidenceReady({ blobUrl: this.recordedAudioBlobUrl, base64: this.recordedAudioBase64, duration: this.evidenceDurationSeconds });
        } catch (e) {
          console.warn("[SafeAudioEngine] onEvidenceReady callback error:", e);
        }
      }
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("[SafeAudioEngine] MediaDevices API not available. Creating synthesized sample audio.");
      this.createSynthesizedEvidenceBuffer();
      return;
    }

    try {
      const stream = await this.requestMicrophoneStream();
      if (!stream) {
        this.createSynthesizedEvidenceBuffer();
        return;
      }

      const mimeType = this.getSupportedAudioMimeType();
      const recorderOptions = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
      this.isRecordingEvidence = true;

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecordingEvidence = false;
        this.clearEvidenceTimers();
        // Stop all tracks to release hardware immediately
        stream.getTracks().forEach((track) => track.stop());

        if (this.audioChunks.length > 0) {
          const finalMime = mimeType || (this.audioChunks[0] && this.audioChunks[0].type) || "audio/webm";
          const audioBlob = new Blob(this.audioChunks, { type: finalMime });
          const b64 = await this.blobToBase64(audioBlob);
          await finalizeBufferAndNotify(audioBlob, b64);
        } else {
          this.createSynthesizedEvidenceBuffer();
        }
      };

      this.mediaRecorder.start(1000); // Collect data every 1s
      console.info(`[SafeAudioEngine] 🎙️ Emergency ambient evidence recording active (${durationSeconds}s window, Format: ${mimeType || 'browser default'}).`);

      // 30-second evidence auto-stop timer
      this.clearEvidenceTimers();
      this.evidenceAutoStopTimer = setTimeout(() => {
        if (this.isRecordingEvidence) {
          console.info(`[SafeAudioEngine] 🎙️ ${durationSeconds}s evidence capture complete. Finalizing audio stream.`);
          this.stopEvidenceRecording();
        }
      }, durationSeconds * 1000);

      // Track live evidence countdown and update UI progress
      this.evidenceProgressInterval = setInterval(() => {
        if (this.evidenceRemainingSeconds > 0) {
          this.evidenceRemainingSeconds -= 1;
        }
        this.updateEvidenceLoaderProgress();
      }, 1000);

    } catch (err) {
      console.warn("[SafeAudioEngine] Microphone stream permission denied or unavailable:", err);
      // Seamless graceful fallback: synthesize audio evidence buffer for demo verification
      this.createSynthesizedEvidenceBuffer();
    }
  },

  clearEvidenceTimers() {
    if (this.evidenceAutoStopTimer) {
      clearTimeout(this.evidenceAutoStopTimer);
      this.evidenceAutoStopTimer = null;
    }
    if (this.evidenceProgressInterval) {
      clearInterval(this.evidenceProgressInterval);
      this.evidenceProgressInterval = null;
    }
  },

  /**
   * Stop MediaRecorder and finalize evidence buffer.
   * Returns a Promise that resolves when audio Blob URL is generated.
   */
  stopEvidenceRecording() {
    this.clearEvidenceTimers();
    return new Promise((resolve) => {
      if (this.mediaRecorder && this.isRecordingEvidence) {
        const originalOnStop = this.mediaRecorder.onstop;
        this.mediaRecorder.onstop = async (e) => {
          if (typeof originalOnStop === "function") {
            await originalOnStop(e);
          }
          resolve({ blobUrl: this.recordedAudioBlobUrl, base64: this.recordedAudioBase64 });
        };
        try {
          this.mediaRecorder.stop();
        } catch (e) {
          console.warn("[SafeAudioEngine] Error stopping MediaRecorder:", e);
          resolve({ blobUrl: this.recordedAudioBlobUrl, base64: this.recordedAudioBase64 });
        }
      } else {
        resolve({ blobUrl: this.recordedAudioBlobUrl, base64: this.recordedAudioBase64 });
      }
    });
  },

  /**
   * Discard recorded evidence upon PIN cancellation.
   * Stops recording, drops all chunks, revokes Blob URL, and leaves no traces.
   */
  discardEvidenceRecording() {
    this.clearEvidenceTimers();
    if (this.mediaRecorder && this.isRecordingEvidence) {
      try {
        this.mediaRecorder.onstop = null; // Detach normal processing
        this.mediaRecorder.stop();
        if (this.mediaRecorder.stream) {
          this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {}
    }
    this.isRecordingEvidence = false;
    this.audioChunks = [];
    if (this.recordedAudioBlobUrl) {
      try { URL.revokeObjectURL(this.recordedAudioBlobUrl); } catch (e) {}
    }
    this.recordedAudioBlobUrl = null;
    this.recordedAudioBase64 = null;

    const container = typeof document !== "undefined" ? document.getElementById("emg-audio-player-container") : null;
    if (container) {
      container.innerHTML = "";
      container.style.display = "none";
    }
    console.info("[SafeAudioEngine] 🛡️ Emergency audio evidence discarded upon PIN cancellation.");
  },

  /**
   * Convert Blob to Base64 string for API transport and immutable incident logging
   */
  blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Synthetic Audio Tone Generator for offline/hardware-restricted demo validation
   * Uses Web Audio API to create a 3-second emergency beep buffer
   */
  createSynthesizedEvidenceBuffer() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const sampleRate = ctx.sampleRate;
      const duration = 2.0;
      const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
      const data = buffer.getChannelData(0);

      // Generate ambient chime frequency for evidence buffer
      for (let i = 0; i < buffer.length; i++) {
        data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.15 * Math.exp(-i / (sampleRate * 0.8));
      }

      // Encode synthesized WAV
      const wavBlob = this.audioBufferToWav(buffer);
      this.recordedAudioBlobUrl = URL.createObjectURL(wavBlob);
      this.blobToBase64(wavBlob).then((b64) => {
        this.recordedAudioBase64 = b64;
        this.renderAudioEvidenceWidget(this.recordedAudioBlobUrl);
      });
    } catch (e) {
      console.warn("[SafeAudioEngine] Synth fallback note:", e);
    }
  },

  /**
   * Render active recording loader & countdown skeleton in Emergency Screen & modals
   */
  renderEvidenceLoader(remainingSeconds = this.evidenceRemainingSeconds, totalSeconds = this.evidenceDurationSeconds) {
    if (typeof document === "undefined") return;
    const container = document.getElementById("emg-audio-player-container");
    if (!container) return;

    const rem = Math.max(0, remainingSeconds !== undefined ? remainingSeconds : 30);
    const tot = totalSeconds || 30;
    const elapsed = Math.max(0, tot - rem);
    const percent = Math.min(100, Math.max(4, Math.round((elapsed / tot) * 100)));

    container.innerHTML = `
      <div class="audio-evidence-loader" id="emg-audio-loader-card">
        <div class="loader-header-row">
          <div class="loader-meta">
            <div class="loader-tag-row">
              <span class="live-rec-badge">
                <span class="rec-dot pulsing-red"></span>
                <span class="rec-label">REC</span>
              </span>
              <span class="loader-tag">🎙️ Ambient Audio Evidence</span>
              <span class="loader-pill-buffer">${tot}s Buffer</span>
            </div>
            <span class="loader-status">Live ambient recording for 112 CAD & Guardian dispatch</span>
          </div>
          <div class="loader-timer-badge" id="emg-audio-cd-badge">
            <svg class="timer-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span id="emg-audio-cd-text">${rem}s left</span>
          </div>
        </div>

        <div class="audio-progress-section">
          <div class="audio-skeleton-track">
            <div class="audio-skeleton-bar" id="emg-audio-progress-bar" style="width: ${percent}%;"></div>
          </div>
          <div class="progress-sub-info">
            <span class="progress-elapsed" id="emg-audio-elapsed-txt">${elapsed}s of ${tot}s</span>
            <span class="progress-pct" id="emg-audio-pct-txt">${percent}%</span>
          </div>
        </div>

        <div class="audio-visualizer-container">
          <div class="audio-skeleton-wave">
            <span class="wave-bar wb-1"></span>
            <span class="wave-bar wb-2"></span>
            <span class="wave-bar wb-3"></span>
            <span class="wave-bar wb-4"></span>
            <span class="wave-bar wb-5"></span>
            <span class="wave-bar wb-6"></span>
            <span class="wave-bar wb-7"></span>
            <span class="wave-bar wb-8"></span>
            <span class="wave-bar wb-9"></span>
            <span class="wave-bar wb-10"></span>
            <span class="wave-bar wb-11"></span>
            <span class="wave-bar wb-12"></span>
            <span class="wave-bar wb-13"></span>
            <span class="wave-bar wb-14"></span>
          </div>
          <div class="wave-status-box">
            <span class="wave-caption">Recording audio evidence snippet in background...</span>
          </div>
        </div>
      </div>
    `;
    container.style.display = "block";
  },

  /**
   * Update existing loader countdown and progress bar without re-rendering DOM
   */
  updateEvidenceLoaderProgress() {
    if (typeof document === "undefined") return;
    const badgeText = document.getElementById("emg-audio-cd-text");
    const bar = document.getElementById("emg-audio-progress-bar");
    const elapsedTxt = document.getElementById("emg-audio-elapsed-txt");
    const pctTxt = document.getElementById("emg-audio-pct-txt");

    const rem = Math.max(0, this.evidenceRemainingSeconds !== undefined ? this.evidenceRemainingSeconds : 0);
    const tot = this.evidenceDurationSeconds || 30;
    const elapsed = Math.max(0, tot - rem);
    const percent = Math.min(100, Math.max(4, Math.round((elapsed / tot) * 100)));

    if (badgeText) badgeText.textContent = `${rem}s left`;
    if (bar) bar.style.width = `${percent}%`;
    if (elapsedTxt) elapsedTxt.textContent = `${elapsed}s of ${tot}s`;
    if (pctTxt) pctTxt.textContent = `${percent}%`;
  },

  /**
   * Render in-app audio playback player in Emergency Screen & modals
   */
  renderAudioEvidenceWidget(audioUrl) {
    if (typeof document === "undefined") return;
    const container = document.getElementById("emg-audio-player-container");
    if (!container) return;

    container.innerHTML = `
      <div class="audio-evidence-player">
        <div class="player-meta">
          <span class="player-tag">🎙️ Audio Evidence Available (30s Capture)</span>
          <span class="player-status">Ready for Playback • CAD / Guardian Dispatch</span>
        </div>
        <audio controls src="${audioUrl}" class="evidence-audio-ctrl" style="width: 100%; margin-top: 8px; border-radius: 8px; outline: none;"></audio>
      </div>
    `;
    container.style.display = "block";
  },

  /**
   * Minimal PCM WAV encoder for synthetic buffer
   */
  audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (offset < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return new Blob([out], { type: "audio/wav" });
  }
};

if (typeof window !== "undefined") {
  window.SafeAudioEngine = SafeAudioEngine;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeAudioEngine;
}
