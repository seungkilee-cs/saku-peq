/**
 * Frequency Response Calculation Utilities
 * 
 * Provides theoretical frequency response calculation for PEQ bands
 * independent of Web Audio API nodes. Useful for visualization and analysis.
 */

/**
 * Generate logarithmic frequency points from 20Hz to 20kHz
 * @param {number} numPoints - Number of frequency points to generate
 * @returns {Float32Array} Array of frequencies in Hz
 */
export const DEFAULT_SAMPLE_RATE = 48000;
export const MIN_GAIN_DB = -48;
export const MAX_GAIN_DB = 48;
const GAIN_EPSILON = 1e-3;
const MIN_Q = 1e-6;
const MIN_SLOPE = 1e-6;

function normalizeCoefficients(b0, b1, b2, a0, a1, a2) {
  if (!Number.isFinite(a0) || Math.abs(a0) < Number.EPSILON) {
    return null;
  }
  const invA0 = 1 / a0;
  return {
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0
  };
}

function biquadMagnitudeDb(coefficients, w) {
  if (!coefficients) {
    return 0;
  }

  const { b0, b1, b2, a1, a2 } = coefficients;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);

  const numReal = b0 + b1 * cosw + b2 * cos2w;
  const numImag = b1 * -sinw + b2 * -sin2w;
  const denReal = 1 + a1 * cosw + a2 * cos2w;
  const denImag = a1 * -sinw + a2 * -sin2w;

  const numMagSquared = numReal * numReal + numImag * numImag;
  const denMagSquared = denReal * denReal + denImag * denImag;

  if (!Number.isFinite(numMagSquared) || !Number.isFinite(denMagSquared) || denMagSquared === 0) {
    return 0;
  }

  const magnitude = Math.sqrt(numMagSquared / denMagSquared);
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return 0;
  }

  return 20 * Math.log10(magnitude);
}

function clampDb(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, value));
}

export function generateFrequencies(numPoints = 512) {
  const frequencies = new Float32Array(numPoints);
  const minFreq = 20;
  const maxFreq = 20000;
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  
  for (let i = 0; i < numPoints; i++) {
    const logFreq = logMin + (i / (numPoints - 1)) * (logMax - logMin);
    frequencies[i] = Math.pow(10, logFreq);
  }
  
  return frequencies;
}

/**
 * Calculate frequency response for a single EQ band
 * @param {number} frequency - Frequency to calculate response for (Hz)
 * @param {Object} band - EQ band configuration
 * @param {number} band.frequency - Center frequency (Hz)
 * @param {number} band.gain - Gain in dB
 * @param {number} band.Q - Q factor
 * @param {string} band.type - Filter type ('peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass')
 * @returns {number} Response in dB
 */
export function calculateBandResponse(frequency, band, options = {}) {
  if (!band) {
    return 0;
  }

  const centerFreq = band.frequency;
  if (!Number.isFinite(centerFreq) || centerFreq <= 0) {
    return 0;
  }

  if (!Number.isFinite(frequency) || frequency <= 0) {
    return 0;
  }

  const type = band.type || 'peaking';
  const gain = Number.isFinite(band.gain) ? band.gain : 0;
  const qValue = Math.max(Number.isFinite(band.Q) ? band.Q : 1, MIN_Q);
  const slope = Math.max(band.S ?? band.s ?? qValue, MIN_SLOPE);

  if (Math.abs(gain) < GAIN_EPSILON && (type === 'peaking' || type === 'lowshelf' || type === 'highshelf')) {
    return 0;
  }

  const sampleRate = options.sampleRate ?? band.sampleRate ?? DEFAULT_SAMPLE_RATE;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 0;
  }

  const nyquist = sampleRate / 2;
  const targetFreq = Math.min(Math.max(frequency, 0), nyquist * 0.999999);
  const w0 = (2 * Math.PI * centerFreq) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);

  let coefficients = null;

  switch (type) {
    case 'peaking': {
      const A = Math.pow(10, gain / 40);
      const alpha = sinw0 / (2 * qValue);
      const b0 = 1 + alpha * A;
      const b1 = -2 * cosw0;
      const b2 = 1 - alpha * A;
      const a0 = 1 + alpha / A;
      const a1 = -2 * cosw0;
      const a2 = 1 - alpha / A;
      coefficients = normalizeCoefficients(b0, b1, b2, a0, a1, a2);
      break;
    }

    case 'lowshelf': {
      const A = Math.pow(10, gain / 40);
      const alphaTerm = Math.max(0, (A + 1 / A) * (1 / slope - 1) + 2);
      const alpha = (sinw0 / 2) * Math.sqrt(alphaTerm);
      const beta = 2 * Math.sqrt(A) * alpha;
      const b0 = A * ((A + 1) - (A - 1) * cosw0 + beta);
      const b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
      const b2 = A * ((A + 1) - (A - 1) * cosw0 - beta);
      const a0 = (A + 1) + (A - 1) * cosw0 + beta;
      const a1 = -2 * ((A - 1) + (A + 1) * cosw0);
      const a2 = (A + 1) + (A - 1) * cosw0 - beta;
      coefficients = normalizeCoefficients(b0, b1, b2, a0, a1, a2);
      break;
    }

    case 'highshelf': {
      const A = Math.pow(10, gain / 40);
      const alphaTerm = Math.max(0, (A + 1 / A) * (1 / slope - 1) + 2);
      const alpha = (sinw0 / 2) * Math.sqrt(alphaTerm);
      const beta = 2 * Math.sqrt(A) * alpha;
      const b0 = A * ((A + 1) + (A - 1) * cosw0 + beta);
      const b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      const b2 = A * ((A + 1) + (A - 1) * cosw0 - beta);
      const a0 = (A + 1) - (A - 1) * cosw0 + beta;
      const a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      const a2 = (A + 1) - (A - 1) * cosw0 - beta;
      coefficients = normalizeCoefficients(b0, b1, b2, a0, a1, a2);
      break;
    }

    case 'lowpass': {
      const alpha = sinw0 / (2 * qValue);
      const b0 = (1 - cosw0) / 2;
      const b1 = 1 - cosw0;
      const b2 = (1 - cosw0) / 2;
      const a0 = 1 + alpha;
      const a1 = -2 * cosw0;
      const a2 = 1 - alpha;
      coefficients = normalizeCoefficients(b0, b1, b2, a0, a1, a2);
      break;
    }

    case 'highpass': {
      const alpha = sinw0 / (2 * qValue);
      const b0 = (1 + cosw0) / 2;
      const b1 = -(1 + cosw0);
      const b2 = (1 + cosw0) / 2;
      const a0 = 1 + alpha;
      const a1 = -2 * cosw0;
      const a2 = 1 - alpha;
      coefficients = normalizeCoefficients(b0, b1, b2, a0, a1, a2);
      break;
    }

    default:
      return 0;
  }

  if (!coefficients) {
    return 0;
  }

  const w = (2 * Math.PI * targetFreq) / sampleRate;
  return biquadMagnitudeDb(coefficients, w);
}

/**
 * Calculate complete frequency response for multiple EQ bands
 * @param {Array} bands - Array of EQ band configurations
 * @param {Object} options - Calculation options
 * @param {number} options.numPoints - Number of frequency points (default: 512)
 * @param {number} options.minFreq - Minimum frequency in Hz (default: 20)
 * @param {number} options.maxFreq - Maximum frequency in Hz (default: 20000)
 * @returns {Object} Object with frequencies array and magnitudeDb array
 */
export function calculateFrequencyResponse(bands, options = {}) {
  const { numPoints = 512, minFreq = 20, maxFreq = 20000, sampleRate = DEFAULT_SAMPLE_RATE } = options;
  
  // Generate frequency points
  const frequencies = new Float32Array(numPoints);
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  
  for (let i = 0; i < numPoints; i++) {
    const logFreq = logMin + (i / (numPoints - 1)) * (logMax - logMin);
    frequencies[i] = Math.pow(10, logFreq);
  }
  
  // Calculate response at each frequency point
  const magnitudeDb = new Array(numPoints).fill(0);
  
  for (let i = 0; i < numPoints; i++) {
    const freq = frequencies[i];
    let totalGain = 0;

    bands.forEach((band) => {
      if (!band) {
        return;
      }

      const bandResponse = calculateBandResponse(freq, band, { sampleRate });
      if (Number.isFinite(bandResponse)) {
        totalGain += bandResponse;
      }
    });

    magnitudeDb[i] = clampDb(totalGain);
  }
  
  return {
    frequencies: Array.from(frequencies),
    magnitudeDb
  };
}

/**
 * Calculate frequency response from PEQProcessor state
 * @param {Object} peqState - State object from PEQProcessor.getState()
 * @param {Object} options - Calculation options (same as calculateFrequencyResponse)
 * @returns {Object} Object with frequencies array and magnitudeDb array
 */
export function calculateProcessorResponse(peqState, options = {}) {
  if (!peqState || !peqState.bands) {
    throw new Error('calculateProcessorResponse requires a valid PEQ state with bands');
  }
  
  return calculateFrequencyResponse(peqState.bands, options);
}

/**
 * Get frequency response at specific frequencies
 * @param {Array} bands - Array of EQ band configurations
 * @param {Array} targetFrequencies - Array of frequencies to calculate response for
 * @returns {Array} Array of response values in dB
 */
export function getResponseAtFrequencies(bands, targetFrequencies, options = {}) {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  return targetFrequencies.map(freq => {
    let totalGain = 0;
    
    bands.forEach(band => {
      if (!band) {
        return;
      }
      
      const bandResponse = calculateBandResponse(freq, band, { sampleRate });
      if (Number.isFinite(bandResponse)) {
        totalGain += bandResponse;
      }
    });
    
    return clampDb(totalGain);
  });
}