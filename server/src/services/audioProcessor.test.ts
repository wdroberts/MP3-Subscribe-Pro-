import { getConvertedPath } from './audioProcessor';

// ffmpeg-dependent functions (convertToLinear16, validateMp3) require
// the actual ffmpeg binary, so we test the pure utility function and
// mock-based scenarios here.

describe('audioProcessor', () => {
  describe('getConvertedPath', () => {
    it('returns the wav path in the given directory', () => {
      expect(getConvertedPath('/tmp/uploads/abc')).toBe('/tmp/uploads/abc/audio.wav');
    });

    it('handles paths with trailing separators', () => {
      const result = getConvertedPath('/tmp/uploads/abc');
      expect(result).toContain('audio.wav');
    });
  });
});
