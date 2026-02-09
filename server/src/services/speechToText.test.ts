import { groupWordsIntoSentences, WordInfo } from './speechToText';

describe('groupWordsIntoSentences', () => {
  it('groups words ending with period into a sentence', () => {
    const words: WordInfo[] = [
      { word: 'Hello', startTime: 0, endTime: 0.5 },
      { word: 'world.', startTime: 0.5, endTime: 1.0 },
    ];
    const segments = groupWordsIntoSentences(words);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello world.');
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(1.0);
    expect(segments[0].index).toBe(0);
  });

  it('splits on multiple sentence-ending punctuation', () => {
    const words: WordInfo[] = [
      { word: 'First.', startTime: 0, endTime: 1 },
      { word: 'Second!', startTime: 1, endTime: 2 },
      { word: 'Third?', startTime: 2, endTime: 3 },
    ];
    const segments = groupWordsIntoSentences(words);
    expect(segments).toHaveLength(3);
    expect(segments[0].text).toBe('First.');
    expect(segments[1].text).toBe('Second!');
    expect(segments[2].text).toBe('Third?');
  });

  it('keeps words without punctuation as a single segment', () => {
    const words: WordInfo[] = [
      { word: 'no', startTime: 0, endTime: 0.5 },
      { word: 'punctuation', startTime: 0.5, endTime: 1 },
      { word: 'here', startTime: 1, endTime: 1.5 },
    ];
    const segments = groupWordsIntoSentences(words);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('no punctuation here');
  });

  it('handles empty word list', () => {
    expect(groupWordsIntoSentences([])).toEqual([]);
  });

  it('assigns sequential indices', () => {
    const words: WordInfo[] = [
      { word: 'One.', startTime: 0, endTime: 1 },
      { word: 'Two.', startTime: 1, endTime: 2 },
      { word: 'Three.', startTime: 2, endTime: 3 },
    ];
    const segments = groupWordsIntoSentences(words);
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('correctly tracks start and end times across words', () => {
    const words: WordInfo[] = [
      { word: 'The', startTime: 1.5, endTime: 1.8 },
      { word: 'quick', startTime: 1.8, endTime: 2.2 },
      { word: 'fox.', startTime: 2.2, endTime: 2.8 },
    ];
    const segments = groupWordsIntoSentences(words);
    expect(segments[0].startTime).toBe(1.5);
    expect(segments[0].endTime).toBe(2.8);
  });
});
