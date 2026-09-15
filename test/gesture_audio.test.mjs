import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../src/core/GestureRecognizer.ts';

// Yordamchi: Mock 21 ta qo'l nuqtalarini yaratish
function createMockHand(baseCoords = {}) {
  const landmarks = [];
  for (let i = 0; i < 21; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1.0,
      ...baseCoords[i]
    });
  }
  return { landmarks, handedness: 'Right' };
}

test('1. GestureRecognizer: THUMBS_UP (👍) to\'g\'ri aniqlanishi', () => {
  const recognizer = new GestureRecognizer();

  // Barcha 4 barmoq bukilgan (MCP dan pastroq), bosh barmoq YUQORIGA (y kichik)
  const hand = createMockHand({
    0: { x: 0.5, y: 0.8 },   // Wrist
    2: { x: 0.45, y: 0.6 },  // Thumb MCP
    3: { x: 0.45, y: 0.5 },  // Thumb IP
    4: { x: 0.45, y: 0.35 }, // Thumb TIP (yuqoriga)
    5: { x: 0.5, y: 0.55 },  // Index MCP
    6: { x: 0.5, y: 0.65 },  // Index PIP
    8: { x: 0.5, y: 0.72 },  // Index TIP (bukilgan)
    9: { x: 0.55, y: 0.55 },
    10: { x: 0.55, y: 0.65 },
    12: { x: 0.55, y: 0.72 }, // Middle TIP (bukilgan)
    13: { x: 0.6, y: 0.55 },
    14: { x: 0.6, y: 0.65 },
    16: { x: 0.6, y: 0.72 }, // Ring TIP (bukilgan)
    17: { x: 0.65, y: 0.55 },
    18: { x: 0.65, y: 0.65 },
    20: { x: 0.65, y: 0.72 }  // Pinky TIP (bukilgan)
  });

  // Dominant buffer barqarorlashishi uchun bir necha frame chaqiramiz
  let result;
  for (let i = 0; i < 8; i++) {
    result = recognizer.recognize([hand]);
  }

  assert.equal(result.gesture, 'THUMBS_UP');
});

test('2. GestureRecognizer: THUMBS_DOWN (👎) to\'g\'ri aniqlanishi', () => {
  const recognizer = new GestureRecognizer();

  const hand = createMockHand({
    0: { x: 0.5, y: 0.4 },   // Wrist
    2: { x: 0.45, y: 0.5 },  // Thumb MCP
    3: { x: 0.45, y: 0.6 },  // Thumb IP
    4: { x: 0.45, y: 0.75 }, // Thumb TIP (pastga)
    5: { x: 0.5, y: 0.45 },
    6: { x: 0.5, y: 0.42 },
    8: { x: 0.5, y: 0.38 },  // Index bukilgan
    9: { x: 0.55, y: 0.45 },
    10: { x: 0.55, y: 0.42 },
    12: { x: 0.55, y: 0.38 }, // Middle bukilgan
    13: { x: 0.6, y: 0.45 },
    14: { x: 0.6, y: 0.42 },
    16: { x: 0.6, y: 0.38 }, // Ring bukilgan
    17: { x: 0.65, y: 0.45 },
    18: { x: 0.65, y: 0.42 },
    20: { x: 0.65, y: 0.38 }  // Pinky bukilgan
  });

  let result;
  for (let i = 0; i < 8; i++) {
    result = recognizer.recognize([hand]);
  }

  assert.equal(result.gesture, 'THUMBS_DOWN');
});

test('3. GestureRecognizer: PINCH (🤏) aniqlanishi va pinchDistance hisoblanishi', () => {
  const recognizer = new GestureRecognizer();

  // Bosh va ko'rsatkich barmoq uchlari bir-biriga juda yaqin (masofa ~0.02)
  const hand = createMockHand({
    0: { x: 0.5, y: 0.8 },
    4: { x: 0.51, y: 0.4 }, // Thumb tip
    8: { x: 0.50, y: 0.41 }, // Index tip (yaqin)
    5: { x: 0.5, y: 0.6 },
    6: { x: 0.5, y: 0.5 },
    9: { x: 0.55, y: 0.6 },
    10: { x: 0.55, y: 0.7 },
    12: { x: 0.55, y: 0.75 }, // Middle bukilgan
    13: { x: 0.6, y: 0.6 },
    16: { x: 0.6, y: 0.75 },
    17: { x: 0.65, y: 0.6 },
    20: { x: 0.65, y: 0.75 }
  });

  let result;
  for (let i = 0; i < 8; i++) {
    result = recognizer.recognize([hand]);
  }

  assert.equal(result.gesture, 'PINCH');
  assert.ok(result.pinchDistance <= 0.2);
});

test('4. GestureRecognizer: FIST (✊) barcha barmoqlar bukilgan holat', () => {
  const recognizer = new GestureRecognizer();

  const hand = createMockHand({
    0: { x: 0.5, y: 0.8 },
    2: { x: 0.45, y: 0.6 },
    4: { x: 0.48, y: 0.6 }, // Thumb bukilgan
    5: { x: 0.5, y: 0.6 },
    8: { x: 0.5, y: 0.7 },  // Index bukilgan
    9: { x: 0.55, y: 0.6 },
    12: { x: 0.55, y: 0.7 }, // Middle bukilgan
    13: { x: 0.6, y: 0.6 },
    16: { x: 0.6, y: 0.7 }, // Ring bukilgan
    17: { x: 0.65, y: 0.6 },
    20: { x: 0.65, y: 0.7 }  // Pinky bukilgan
  });

  let result;
  for (let i = 0; i < 8; i++) {
    result = recognizer.recognize([hand]);
  }

  assert.equal(result.gesture, 'FIST');
});

test('5. GestureRecognizer: TWO-HANDED HEART (LOVE 🫶 NARGIZA)', () => {
  const recognizer = new GestureRecognizer();

  // Ikki qo'l barmoq uchlari birlashgan
  const h1 = createMockHand({
    0: { x: 0.4, y: 0.7 },
    4: { x: 0.48, y: 0.6 },  // Thumb tip
    8: { x: 0.48, y: 0.45 }, // Index tip
    9: { x: 0.4, y: 0.55 }
  });

  const h2 = createMockHand({
    0: { x: 0.6, y: 0.7 },
    4: { x: 0.52, y: 0.6 },  // Thumb tip (h1 ga yaqin)
    8: { x: 0.52, y: 0.45 }, // Index tip (h1 ga yaqin)
    9: { x: 0.6, y: 0.55 }
  });

  let result;
  for (let i = 0; i < 8; i++) {
    result = recognizer.recognize([h1, h2]);
  }

  assert.equal(result.gesture, 'LOVE');
});
