// Tests for audioProcessor with mocked fluent-ffmpeg

const mockFfprobe = jest.fn();
const mockSave = jest.fn();
const mockOn = jest.fn();
const mockAudioChannels = jest.fn();
const mockAudioFrequency = jest.fn();
const mockAudioCodec = jest.fn();
const mockFormat = jest.fn();
const mockDuration = jest.fn();

// Build a chainable mock
const chainable = {
  audioChannels: mockAudioChannels,
  audioFrequency: mockAudioFrequency,
  audioCodec: mockAudioCodec,
  format: mockFormat,
  duration: mockDuration,
  on: mockOn,
  save: mockSave,
};

mockAudioChannels.mockReturnValue(chainable);
mockAudioFrequency.mockReturnValue(chainable);
mockAudioCodec.mockReturnValue(chainable);
mockFormat.mockReturnValue(chainable);
mockDuration.mockReturnValue(chainable);
mockOn.mockReturnValue(chainable);
mockSave.mockReturnValue(chainable);

const mockFfmpeg = jest.fn().mockReturnValue(chainable) as jest.Mock & { ffprobe: jest.Mock };
mockFfmpeg.ffprobe = mockFfprobe;

jest.mock('fluent-ffmpeg', () => ({
  __esModule: true,
  default: mockFfmpeg,
}));

import { convertToLinear16, validateMp3 } from './audioProcessor';

describe('audioProcessor (mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup chainable returns after clear
    mockAudioChannels.mockReturnValue(chainable);
    mockAudioFrequency.mockReturnValue(chainable);
    mockAudioCodec.mockReturnValue(chainable);
    mockFormat.mockReturnValue(chainable);
    mockDuration.mockReturnValue(chainable);
    mockOn.mockReturnValue(chainable);
    mockSave.mockReturnValue(chainable);
  });

  describe('convertToLinear16', () => {
    it('converts audio and returns AudioMeta on success', async () => {
      // Capture the 'end' callback
      mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'end') {
          // Trigger end immediately when save is called
          mockSave.mockImplementation(() => {
            cb();
          });
        }
        return chainable;
      });

      // Mock ffprobe to return duration
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, { format: { duration: 42.5 } });
      });

      const result = await convertToLinear16('/tmp/input.mp3', '/tmp/output');
      expect(result).toEqual({
        sampleRateHertz: 16000,
        durationSeconds: 42.5,
      });
      expect(mockAudioChannels).toHaveBeenCalledWith(1);
      expect(mockAudioFrequency).toHaveBeenCalledWith(16000);
      expect(mockAudioCodec).toHaveBeenCalledWith('pcm_s16le');
      expect(mockFormat).toHaveBeenCalledWith('wav');
    });

    it('rejects when ffprobe fails', async () => {
      mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'end') {
          mockSave.mockImplementation(() => {
            cb();
          });
        }
        return chainable;
      });

      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(new Error('ffprobe failed'), null);
      });

      await expect(convertToLinear16('/tmp/input.mp3', '/tmp/output'))
        .rejects.toThrow('ffprobe failed');
    });

    it('rejects when ffmpeg conversion errors', async () => {
      mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'error') {
          mockSave.mockImplementation(() => {
            cb(new Error('conversion failed'));
          });
        }
        return chainable;
      });

      await expect(convertToLinear16('/tmp/input.mp3', '/tmp/output'))
        .rejects.toThrow('conversion failed');
    });
  });

  describe('validateMp3', () => {
    it('returns true when file has audio streams', async () => {
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          streams: [
            { codec_type: 'audio' },
          ],
        });
      });

      const result = await validateMp3('/tmp/test.mp3');
      expect(result).toBe(true);
    });

    it('returns false when file has no audio streams', async () => {
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(null, {
          streams: [
            { codec_type: 'video' },
          ],
        });
      });

      const result = await validateMp3('/tmp/test.mp3');
      expect(result).toBe(false);
    });

    it('returns false when ffprobe errors', async () => {
      mockFfprobe.mockImplementation((_path: string, cb: (err: Error | null, meta: unknown) => void) => {
        cb(new Error('not a media file'), null);
      });

      // Set up the ffmpeg fallback chain to fire the error callback when save is called
      let errorCb: ((err: Error) => void) | undefined;
      mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'error') {
          errorCb = cb as (err: Error) => void;
        }
        return chainable;
      });
      mockSave.mockImplementation(() => {
        if (errorCb) errorCb(new Error('not a media file'));
        return chainable;
      });

      const result = await validateMp3('/tmp/test.txt');
      expect(result).toBe(false);
    });
  });
});
