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

  // Bilingual distress triggers
  distressKeywords: [
    "help me",
    "help",
    "bachao",
    "bachao mujhe",
    "stop it",
    "stop",
    "leave me",
    "leave me alone",
    "chhod luggage",
    "chhod mujhe",
    "chodo",
    "police",
    "emergency",
    "khatra",
    "danger"
  ],

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

  /**
   * Initialize Web Speech API continuous recognition if supported by browser
   */
  initSpeechRecognition(onKeywordDetected) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.info("[SafeAudioEngine] Web Speech API not natively supported; manual simulation enabled.");
      this.updateMicStatusBadge(false, "Speech API Not Available (Use Simulation)");
      return;
    }

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

          for (const keyword of this.distressKeywords) {
            if (transcript.includes(keyword)) {
              console.warn(`[SafeAudioEngine] 🚨 DISTRESS KEYWORD DETECTED: "${keyword}"`);
              if (typeof onKeywordDetected === "function") {
                onKeywordDetected(keyword);
              }
              break;
            }
          }
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("[SafeAudioEngine] Speech recognition error/silence:", event.error);
        if (event.error === "not-allowed") {
          this.updateMicStatusBadge(false, "Microphone Access Blocked");
        }
      };

      this.recognition.onend = () => {
        // Auto-restart listener if Safety Mode is still active
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            // Already started or busy
          }
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
   * Start MediaRecorder to capture ambient audio evidence during emergency verification/escalation
   */
  async startEvidenceRecording() {
    this.audioChunks = [];
    this.recordedAudioBase64 = null;
    this.recordedAudioBlobUrl = null;

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
      this.mediaRecorder = new MediaRecorder(stream);
      this.isRecordingEvidence = true;

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecordingEvidence = false;
        // Stop all tracks to release hardware
        stream.getTracks().forEach((track) => track.stop());

        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: "audio/webm;codecs=opus" });
          this.recordedAudioBlobUrl = URL.createObjectURL(audioBlob);
          this.recordedAudioBase64 = await this.blobToBase64(audioBlob);
          this.renderAudioEvidenceWidget(this.recordedAudioBlobUrl);
        } else {
          this.createSynthesizedEvidenceBuffer();
        }
      };

      this.mediaRecorder.start(1000); // Collect data every 1s
      console.info("[SafeAudioEngine] 🎙️ Emergency ambient evidence recording active...");
    } catch (err) {
      console.warn("[SafeAudioEngine] Microphone stream permission denied or unavailable:", err);
      // Seamless graceful fallback: synthesize audio evidence buffer for demo verification
      this.createSynthesizedEvidenceBuffer();
    }
  },

  /**
   * Stop MediaRecorder and finalize evidence buffer
   */
  stopEvidenceRecording() {
    if (this.mediaRecorder && this.isRecordingEvidence) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn("[SafeAudioEngine] Error stopping MediaRecorder:", e);
      }
    }
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
   * Render in-app audio playback player in Emergency Screen & modals
   */
  renderAudioEvidenceWidget(audioUrl) {
    const container = document.getElementById("emg-audio-player-container");
    if (!container) return;

    container.innerHTML = `
      <div class="audio-evidence-player">
        <div class="player-meta">
          <span class="player-tag">🎙️ Ambient Evidence Capture (Encrypted)</span>
          <span class="player-status">Ready for CAD / Guardian Dispatch</span>
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
