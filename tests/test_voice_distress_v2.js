/**
 * SafeSteps Voice Distress Detection V2 Comprehensive Test Suite
 * Tests microphone conditions, speech keywords, fuzzy typos, false positive guards, and browser fallbacks.
 */

const assert = require("assert");
const SafeAudioEngine = require("../frontend/audio.js");

console.log("=================================================");
console.log("🧪 Running Voice Distress Detection V2 Test Suite");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. Microphone Input & Gain Normalization Tests
// ---------------------------------------------------------------------------
console.log("1. Microphone Input & Gain Normalization Tests:");

runTest("Weak microphone input triggers adaptive amplification", () => {
  SafeAudioEngine.audioPipeline = {
    audioCtx: { currentTime: 0 },
    gainNode: {
      gain: {
        value: 1.0,
        cancelScheduledValues: () => {},
        linearRampToValueAtTime: () => {}
      }
    }
  };

  const quietGain = SafeAudioEngine.adjustAdaptiveGain(0.01);
  assert(quietGain > 1.5, `Expected amplification for quiet mic (>1.5), got ${quietGain}`);
});

runTest("Normal microphone maintains unity gain (~1.0x)", () => {
  const normalGain = SafeAudioEngine.adjustAdaptiveGain(0.12);
  assert.strictEqual(normalGain, 1.0, `Expected 1.0, got ${normalGain}`);
});

runTest("Loud microphone input attenuates to avoid clipping", () => {
  const loudGain = SafeAudioEngine.adjustAdaptiveGain(0.40);
  assert(loudGain < 1.0, `Expected attenuation for loud mic (<1.0), got ${loudGain}`);
});

runTest("Noise floor tracking adjusts dynamically without exploding", () => {
  SafeAudioEngine.noiseFloor = 0.015;
  const noisyRMS = 0.08;
  const updatedFloor = SafeAudioEngine.estimateNoiseFloor(noisyRMS);
  assert(updatedFloor >= 0.015 && updatedFloor <= 0.1, `Noise floor out of safe bounds: ${updatedFloor}`);
});

// ---------------------------------------------------------------------------
// 2. Speech Keywords & Fuzzy Matching Tests
// ---------------------------------------------------------------------------
console.log("\n2. Speech Keywords & Fuzzy Matching Tests:");

const exactKeywords = [
  "help",
  "help me",
  "stop",
  "police",
  "emergency",
  "danger",
  "bachao",
  "bachao mujhe",
  "chodo",
  "khatra"
];

for (const kw of exactKeywords) {
  runTest(`Exact keyword match: "${kw}"`, () => {
    const res = SafeAudioEngine.matchFuzzyKeywords(kw);
    assert(res.hasMatch, `Keyword "${kw}" was not matched`);
    assert(res.matches.some((m) => m.keyword === kw), `Target "${kw}" not in matched list`);
  });
}

const fuzzyMistakes = [
  { input: "hep", expected: "help" },
  { input: "help mi", expected: "help me" },
  { input: "bachaoo", expected: "bachao" },
  { input: "bachaao", expected: "bachao" }
];

for (const { input, expected } of fuzzyMistakes) {
  runTest(`Speech recognition typo tolerance: "${input}" -> "${expected}"`, () => {
    const res = SafeAudioEngine.matchFuzzyKeywords(input);
    assert(res.hasMatch, `Typo "${input}" was not recognized`);
    assert(res.matches.some((m) => m.keyword === expected), `Expected "${expected}", matched: ${JSON.stringify(res.matches)}`);
  });
}

// ---------------------------------------------------------------------------
// 3. False Positive Protection Tests
// ---------------------------------------------------------------------------
console.log("\n3. False Positive Protection Tests:");

const conversationalPhrases = [
  "can you please help me understand this problem",
  "please stop the video right now",
  "where is the nearest police station"
];

for (const phrase of conversationalPhrases) {
  runTest(`Conversational filter rejects benign mention: "${phrase}"`, () => {
    SafeAudioEngine.recentDistressHistory = [];
    const report = SafeAudioEngine.evaluateDistressConfidence({
      transcript: phrase,
      audioAnalysis: { isVoiceActive: true, rms: 0.06, isSuddenLoud: false }
    });
    assert.strictEqual(report.isDistressConfirmed, false, `Expected unconfirmed for conversational phrase, got confirmed with score ${report.score}`);
    assert(report.score < 50, `Score too high for conversational phrase: ${report.score}`);
  });
}

// ---------------------------------------------------------------------------
// 4. Multi-Layer Pipeline & Confidence Scoring Tests
// ---------------------------------------------------------------------------
console.log("\n4. Multi-Layer Pipeline & Confidence Scoring Tests:");

runTest("High confidence distress (keyword + active speech) triggers confirmation", () => {
  SafeAudioEngine.recentDistressHistory = [];
  let triggered = false;
  SafeAudioEngine.onDistressDetected = (kw, report) => {
    triggered = true;
  };

  SafeAudioEngine.processAudioStreamFrame("bachao mujhe danger", new Uint8Array(256).map((_, i) => (i % 2 === 0 ? 110 : 146)));
  assert.strictEqual(triggered, true, "Expected multi-layer pipeline to trigger confirmed distress");
});

runTest("Sudden scream + distress keyword produces CRITICAL confidence", () => {
  SafeAudioEngine.recentDistressHistory = [];
  const loudWave = new Uint8Array(256).map((_, i) => (i % 2 === 0 ? 10 : 245));
  SafeAudioEngine.analyzeAudioFrame(loudWave);

  const report = SafeAudioEngine.evaluateDistressConfidence({
    transcript: "help me emergency",
    audioAnalysis: SafeAudioEngine.lastAudioAnalysis
  });

  assert(report.score >= 80, `Expected critical/high score for scream + multi-keyword, got ${report.score}`);
  assert(report.confidence === "HIGH" || report.confidence === "CRITICAL", `Expected HIGH or CRITICAL, got ${report.confidence}`);
});

// ---------------------------------------------------------------------------
// 5. Browser & Device Capability Fallback Tests
// ---------------------------------------------------------------------------
console.log("\n5. Browser & Device Capability Fallback Tests:");

runTest("Runtime capability matrix handles headless/Node environment gracefully", () => {
  const caps = SafeAudioEngine.getDeviceCapabilities();
  assert(caps && typeof caps.tier === "string");
  assert.strictEqual(caps.tier, "MANUAL_SOS_ONLY");
});

runTest("Engine does not crash when getUserMedia or SpeechRecognition is missing", () => {
  assert.doesNotThrow(() => {
    SafeAudioEngine.initSpeechRecognition(() => {});
    SafeAudioEngine.startSpeechListening();
    SafeAudioEngine.stopSpeechListening();
    SafeAudioEngine.getSupportedAudioMimeType();
  });
});

console.log("\n=================================================");
console.log(`📊 Summary: ${passedTests}/${totalTests} tests passed.`);
console.log("=================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
