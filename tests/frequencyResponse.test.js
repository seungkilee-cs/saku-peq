import { describe, it, expect } from 'vitest';
import {
  calculateBandResponse,
  calculateFrequencyResponse,
  calculateProcessorResponse,
  getResponseAtFrequencies,
  MIN_GAIN_DB,
  MAX_GAIN_DB,
} from '../src/core/frequencyResponse.js';
import { DEFAULT_PRESET } from '../src/presets/presetManager.js';

describe('frequencyResponse utilities', () => {
  it('matches target gain at the center frequency for peaking filters', () => {
    const band = {
      frequency: 1000,
      gain: 6,
      Q: 1,
      type: 'peaking',
    };
    const response = calculateBandResponse(1000, band, { sampleRate: 48000 });
    expect(response).toBeCloseTo(6, 5);
  });

  it('applies shelving gain in the correct regions', () => {
    const lowShelf = {
      frequency: 120,
      gain: 9,
      Q: 0.7,
      type: 'lowshelf',
    };
    const highShelf = {
      frequency: 8000,
      gain: -6,
      Q: 0.7,
      type: 'highshelf',
    };

    const lowFreqResponse = calculateBandResponse(40, lowShelf, { sampleRate: 48000 });
    const highFreqResponse = calculateBandResponse(16000, lowShelf, { sampleRate: 48000 });
    expect(lowFreqResponse).toBeGreaterThan(7);
    expect(highFreqResponse).toBeLessThan(2);

    const hiShelfLow = calculateBandResponse(2000, highShelf, { sampleRate: 48000 });
    const hiShelfHigh = calculateBandResponse(16000, highShelf, { sampleRate: 48000 });
    expect(hiShelfHigh).toBeLessThan(-4);
    expect(hiShelfLow).toBeGreaterThan(-3);
  });

  it('respects Nyquist when the target frequency exceeds half the sample rate', () => {
    const band = {
      frequency: 6000,
      gain: 12,
      Q: 1,
      type: 'peaking',
    };
    const response = calculateBandResponse(12000, band, { sampleRate: 24000 });
    expect(response).toBeLessThanOrEqual(MAX_GAIN_DB);
    expect(response).toBeGreaterThanOrEqual(MIN_GAIN_DB);
  });

  it('combines multiple bands and clamps to defined limits', () => {
    const bands = [
      { frequency: 1000, gain: 18, Q: 1, type: 'peaking' },
      { frequency: 2000, gain: 18, Q: 1, type: 'peaking' },
    ];
    const { magnitudeDb } = calculateFrequencyResponse(bands, {
      numPoints: 16,
      sampleRate: 48000,
    });
    expect(magnitudeDb).toHaveLength(16);
    magnitudeDb.forEach((value) => {
      expect(value).toBeLessThanOrEqual(MAX_GAIN_DB);
      expect(value).toBeGreaterThanOrEqual(MIN_GAIN_DB);
    });
  });

  it('returns zeros for the default flat processor preset', () => {
    const response = calculateProcessorResponse(DEFAULT_PRESET, {
      numPoints: 32,
      sampleRate: 48000,
    });
    response.magnitudeDb.forEach((value) => {
      expect(value).toBeCloseTo(0, 6);
    });
  });

  it('getResponseAtFrequencies matches calculateFrequencyResponse at sampled points', () => {
    const bands = [
      { frequency: 500, gain: 3, Q: 1, type: 'peaking' },
      { frequency: 2000, gain: -4, Q: 1, type: 'peaking' },
    ];
    const frequencies = [100, 500, 2000, 10000];
    const aggregate = calculateFrequencyResponse(bands, {
      numPoints: 64,
      sampleRate: 48000,
      minFreq: 100,
      maxFreq: 10000,
    });
    const sampled = getResponseAtFrequencies(bands, frequencies, { sampleRate: 48000 });

    frequencies.forEach((freq, index) => {
      const closestIndex = aggregate.frequencies.reduce((bestIndex, value, currentIndex) => {
        const bestValue = aggregate.frequencies[bestIndex];
        const currentDiff = Math.abs(value - freq);
        const bestDiff = Math.abs(bestValue - freq);
        return currentDiff < bestDiff ? currentIndex : bestIndex;
      }, 0);
      expect(sampled[index]).toBeCloseTo(aggregate.magnitudeDb[closestIndex], 2);
    });
  });
});
