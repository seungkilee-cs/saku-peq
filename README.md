# saku-peq

AutoEQ-compatible 10-band parametric EQ utilities for Web Audio projects. Provides a `PEQProcessor` node chain, exact RBJ biquad frequency response math, and preset import/export helpers without runtime dependencies.

## Installation

```bash
npm install saku-peq
```

## Core Concepts

- Processor — `PEQProcessor` wraps 10 biquad filters plus preamp gain, exposing `inputNode`/`outputNode` for Web Audio graphs.
- Frequency response — Helper functions generate accurate dB curves for visualization or verification using RBJ Audio EQ Cookbook formulas.
- Presets — Utilities normalize and validate 10-band layouts, including AutoEQ text import.

## Usage

### 1. Create a PEQ processing chain

```js
import { PEQProcessor, DEFAULT_PRESET } from 'saku-peq';

const audioContext = new AudioContext();
const source = audioContext.createMediaElementSource(audioElement);

const peq = new PEQProcessor(audioContext, {
  preset: DEFAULT_PRESET,
  bypass: false,
});

source.connect(peq.inputNode);
peq.outputNode.connect(audioContext.destination);

// Adjust bands
peq.updateBand(0, { gain: +3, Q: 1.2 });
peq.updateBand(5, { frequency: 3200, gain: -2 });
peq.setPreamp(-3);
```

`PEQProcessor` exposes:

- `inputNode` / `outputNode` — connect to the rest of your Web Audio graph.
- `getState()` — snapshot of current bands and preamp.
- `loadPreset(preset)` — replace the entire 10-band configuration.
- `updateBand(index, changes)` — merge `frequency`, `gain`, `Q`, or `type` into a single band.
- `setPreamp(db)` and `setBypass(boolean)`.
- `dispose()` — disconnect and release Web Audio nodes.

### 2. Calculate frequency response

```js
import {
  calculateFrequencyResponse,
  calculateProcessorResponse,
  getResponseAtFrequencies,
} from 'saku-peq';

const bands = [
  { frequency: 60, gain: +4, Q: 0.75, type: 'lowshelf' },
  { frequency: 1200, gain: -3, Q: 1.4, type: 'peaking' },
];

const response = calculateFrequencyResponse(bands, {
  numPoints: 512,
  minFreq: 20,
  maxFreq: 20000,
  sampleRate: 48000,
});

console.log(response.frequencies); // Float32Array of log-spaced Hz
console.log(response.magnitudeDb); // Float32Array of dB values

// From a running processor
const processorResponse = calculateProcessorResponse(peq.getState(), {
  sampleRate: audioContext.sampleRate,
});

// Evaluate specific targets
const points = getResponseAtFrequencies(bands, [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
```

All calculations clamp to `MIN_GAIN_DB`/`MAX_GAIN_DB` and respect per-band `sampleRate` to match AutoEQ data.

### 3. Work with presets

```js
import {
  DEFAULT_PRESET,
  normalizePreset,
  importPresetFromText,
  exportPreset,
} from 'saku-peq';

// AutoEQ text import
const autoEqText = `
Preamp: -4.1 dB
Filter 1: ON LSC Fc 105 Hz Gain 2.9 dB Q 0.70
Filter 2: ON PK Fc 2042 Hz Gain -4.2 dB Q 2.14
`;

const imported = importPresetFromText(autoEqText, 'Audeze Euclid');
const preset = normalizePreset(imported);

peq.loadPreset(preset);

// Export to AutoEQ JSON/text when needed
const autoEqJson = exportPreset(preset, 'autoeq');
const autoEqTextOut = exportPreset(preset, 'autoeq-text');
```

Bundled helpers such as `listBundledPresets()` and `calculateRecommendedPreamp()` simplify preset selection or gain staging.

## API Reference

### Core
- `PEQProcessor(context, options)` — create the processor. `options.preset`, `options.bypass`, `options.onUpdate` are optional.
- `createPeqChain(context, preset)`, `updatePeqFilters(chain, preset)`, `cleanupPeqChain(chain)` — lower-level Web Audio helpers if you need manual control.

### Frequency Response
- `calculateBandResponse(frequency, band, options)` — single-band magnitude in dB.
- `calculateFrequencyResponse(bands, options)` — combined response for visualization.
- `calculateProcessorResponse(peqState, options)` — convenience wrapper around the processor state.
- `getResponseAtFrequencies(bands, targetFrequencies, options)` — evaluate arbitrary frequency bins.
- `generateFrequencies(numPoints, minFreq, maxFreq)` — produce log-spaced frequency arrays.

### Presets & I/O
- `DEFAULT_PRESET`, `BUNDLED_PRESETS`, `listBundledPresets()` — factory presets.
- `normalizePreset(preset)`, `validatePreset(preset)`, `ensureBandsCount(bands)` — sanity helpers.
- `importPresetFromText(text, filename)`, `convertToNative(preset)`, `exportPreset(preset, format)` — AutoEQ/native/PowerAmp conversions.

## Development

```bash
npm install
npm test           # run Vitest regression suite
npm run build      # emit dist/ bundles (esm, cjs, and d.ts)
```

The repository keeps demos and docs in `exclude/`. They are not part of the published package but demonstrate advanced usage.

## Release Checklist

1. `npm run clean && npm run build`
2. `npm test`
3. Update `CHANGELOG.md` and version in `package.json`
4. `npm pack --dry-run` to inspect tarball contents
5. `npm publish`

## License

MIT — include a `LICENSE` file alongside the package when distributing.
