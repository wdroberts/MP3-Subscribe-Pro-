// Tests for the transcribe function and parseSeconds (indirectly)

const mockRecognize = jest.fn();
const mockLongRunningRecognize = jest.fn();

jest.mock('@google-cloud/speech', () => ({
  __esModule: true,
  default: {
    SpeechClient: jest.fn().mockImplementation(() => ({
      recognize: mockRecognize,
      longRunningRecognize: mockLongRunningRecognize,
    })),
  },
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake audio data')),
}));

import { transcribe } from './speechToText';

describe('transcribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses recognize for short audio (<=60s)', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{
        alternatives: [{
          words: [
            { word: 'Hello.', startTime: { seconds: '0', nanos: 0 }, endTime: { seconds: '1', nanos: 0 } },
          ],
        }],
      }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 30);

    expect(mockRecognize).toHaveBeenCalled();
    expect(mockLongRunningRecognize).not.toHaveBeenCalled();
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello.');
  });

  it('uses longRunningRecognize for long audio (>60s)', async () => {
    mockLongRunningRecognize.mockResolvedValue([{
      promise: () => Promise.resolve([{
        results: [{
          alternatives: [{
            words: [
              { word: 'Long.', startTime: { seconds: '0', nanos: 0 }, endTime: { seconds: '1', nanos: 0 } },
            ],
          }],
        }],
      }]),
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 120);

    expect(mockLongRunningRecognize).toHaveBeenCalled();
    expect(mockRecognize).not.toHaveBeenCalled();
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Long.');
  });

  it('parses string seconds correctly', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{
        alternatives: [{
          words: [
            { word: 'Test.', startTime: { seconds: '5', nanos: 500000000 }, endTime: { seconds: '6', nanos: 0 } },
          ],
        }],
      }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);

    expect(segments[0].startTime).toBeCloseTo(5.5);
    expect(segments[0].endTime).toBe(6);
  });

  it('parses numeric seconds correctly', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{
        alternatives: [{
          words: [
            { word: 'Test.', startTime: { seconds: 3, nanos: 0 }, endTime: { seconds: 4, nanos: 250000000 } },
          ],
        }],
      }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);

    expect(segments[0].startTime).toBe(3);
    expect(segments[0].endTime).toBeCloseTo(4.25);
  });

  it('handles null time objects (parseSeconds returns 0)', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{
        alternatives: [{
          words: [
            { word: 'Test.', startTime: null, endTime: null },
          ],
        }],
      }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);

    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(0);
  });

  it('handles results with no alternatives', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{ alternatives: [] }, { alternatives: [{ words: null }] }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);
    expect(segments).toHaveLength(0);
  });

  it('handles empty results', async () => {
    mockRecognize.mockResolvedValue([{ results: [] }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);
    expect(segments).toHaveLength(0);
  });

  it('groups multiple words into sentences correctly', async () => {
    mockRecognize.mockResolvedValue([{
      results: [{
        alternatives: [{
          words: [
            { word: 'Hello', startTime: { seconds: '0', nanos: 0 }, endTime: { seconds: '0', nanos: 500000000 } },
            { word: 'world.', startTime: { seconds: '0', nanos: 500000000 }, endTime: { seconds: '1', nanos: 0 } },
            { word: 'Good', startTime: { seconds: '1', nanos: 0 }, endTime: { seconds: '1', nanos: 500000000 } },
            { word: 'morning!', startTime: { seconds: '1', nanos: 500000000 }, endTime: { seconds: '2', nanos: 0 } },
          ],
        }],
      }],
    }]);

    const segments = await transcribe('/tmp/audio.wav', 16000, 10);

    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Hello world.');
    expect(segments[1].text).toBe('Good morning!');
  });
});
