// All numbers here are ILLUSTRATIVE. Nothing is measured. Real limits would come
// from baseline runs on the real rig (see the Machynex deck, slides 7-8).

export const CONFIG = {
  tickS: 0.05, // fixed simulation step (20 Hz)

  // setpoint ranges (slider limits)
  massMin: 0.05,
  massMax: 1.5,
  massDefault: 0.15,
  rpmMin: 800,
  rpmMax: 2000,
  nominalRpm: 1450, // PWM speed setpoint of the 12 V DC motor
  currentMin: 0.5,
  currentMax: 5.0, // a 5 A-class sensor and a 12 V 5 A adapter bound this rig
  currentNominal: 1.2,
  tempMin: 25,
  tempMax: 95,
  tempNominal: 38,

  // vibration model: 0.5 mm/s at 0.05 g ... 8.0 mm/s at 1.5 g (at nominal rpm), scaling with rpm^2
  vib: { floor: 0.5, perGram: 7.5 / 1.45, warn: 2.8, crit: 4.5, zones: [1.4, 2.8, 4.5] as readonly number[], gaugeMax: 8 },
  temp: { warn: 55, crit: 75, corroborate: 46 },
  current: { crit: 4.0, corroborate: 1.62 },

  // detection logic (mirrors the deck: persistence + hysteresis + hard limit)
  persistS: { vib: 1.0, temp: 1.0, cur: 0.5 },
  hysteresisS: 2.0,

  // plant dynamics
  spinUpTau: 0.8,
  spinDownTau: 1.6,
  coulombRpmPerS: 120,
  tempTau: 2.5, // thermal response is time-compressed for the demo
  currentTau: 0.25,

  shock: { durS: 0.3, peak: 6.5 },

  leadTime: { minSlope: 0.08, maxShownS: 600 },
  histLen: 200, // 10 s at 20 Hz
  fftBins: 256,
  fftMaxHz: 200,
  waterfallLen: 36,
  captureMax: 7200, // 1 hour of 2 Hz packets

  // 'bench' = the proposal's parts (default); 'industrial' = concept retrofit kit preview (not in the BOM)
  sensorKitDefault: 'bench' as 'bench' | 'industrial',
  eventMax: 2000,
} as const;
