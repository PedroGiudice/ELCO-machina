import type { AudioMetrics } from '../types';

// ============================================================================
// Environment Detection
// ============================================================================

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isAndroid = (): boolean => {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
};

// ============================================================================
// Version Comparison
// ============================================================================

export const isNewerVersion = (remote: string, local: string): boolean => {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
};

// ============================================================================
// ID Generation
// ============================================================================

export const generateHistoryId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// Audio Conversion
// ============================================================================

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(offset, data, true);
    offset += 2;
  }
  function setUint32(data: number) {
    view.setUint32(offset, data, true);
    offset += 4;
  }

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });
};

// ============================================================================
// Audio Analysis
// ============================================================================

export const analyzeAudioContent = async (blob: Blob): Promise<AudioMetrics> => {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);

    let sumSquare = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let silenceSamples = 0;
    const silenceThreshold = 0.01;

    // Sampling for SNR estimation
    const sampledAmplitudes: number[] = [];
    for (let i = 0; i < rawData.length; i += 100) {
      sampledAmplitudes.push(Math.abs(rawData[i]));
    }
    sampledAmplitudes.sort((a, b) => a - b);

    const noiseFloorIndex = Math.floor(sampledAmplitudes.length * 0.1);
    const noiseFloor =
      sampledAmplitudes.slice(0, noiseFloorIndex).reduce((a, b) => a + b, 0) /
      (noiseFloorIndex || 1);

    const signalCeilingIndex = Math.floor(sampledAmplitudes.length * 0.95);
    const signalLevel =
      sampledAmplitudes.slice(signalCeilingIndex).reduce((a, b) => a + b, 0) /
      (sampledAmplitudes.length - signalCeilingIndex || 1);

    const snrRatio = signalLevel / (noiseFloor + 0.000001);

    let clarityScore = Math.min(100, Math.max(0, Math.log10(snrRatio) * 40));

    const silenceRatio =
      sampledAmplitudes.filter((s) => s < 0.01).length / sampledAmplitudes.length;
    if (silenceRatio > 0.9) clarityScore *= 0.5;
    if (silenceRatio < 0.05) clarityScore *= 0.8;

    // Pitch detection (Autocorrelation)
    const sampleRate = audioBuffer.sampleRate;
    let avgPitchHz = 0;

    const sliceStart = Math.floor(rawData.length / 2) - 1024;
    if (sliceStart > 0 && sliceStart + 2048 < rawData.length) {
      const slice = rawData.slice(sliceStart, sliceStart + 2048);
      let bestOffset = -1;
      let bestCorrelation = 0;
      let rms = 0;

      for (let i = 0; i < slice.length; i++) rms += slice[i] * slice[i];
      rms = Math.sqrt(rms / slice.length);

      if (rms > 0.01) {
        for (let offset = 20; offset < 1000; offset++) {
          let correlation = 0;
          for (let i = 0; i < slice.length - offset; i++) {
            correlation += slice[i] * slice[i + offset];
          }
          correlation /= slice.length - offset;

          if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = offset;
          }
        }
        if (bestOffset > -1) {
          avgPitchHz = sampleRate / bestOffset;
        }
      }
    }

    for (let i = 0; i < rawData.length; i++) {
      const sample = rawData[i];
      const absSample = Math.abs(sample);

      sumSquare += sample * sample;
      if (absSample > peak) peak = absSample;
      if (absSample < silenceThreshold) silenceSamples++;

      if (i > 0 && rawData[i] * rawData[i - 1] < 0) {
        zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSquare / rawData.length);
    const rmsDB = 20 * Math.log10(rms);
    const peakDB = 20 * Math.log10(peak);

    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      rmsDB: isFinite(rmsDB) ? rmsDB : -100,
      peakDB: isFinite(peakDB) ? peakDB : -100,
      silenceRatio: (silenceSamples / rawData.length) * 100,
      zeroCrossingRate: zeroCrossings / rawData.length,
      avgPitchHz,
      clarityScore,
    };
  } finally {
    audioContext.close();
  }
};
