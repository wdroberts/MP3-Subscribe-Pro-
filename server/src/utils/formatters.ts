import { TranscriptionSegment } from '../types';

export function formatTimestamp(seconds: number, includeMilli = false): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  if (includeMilli) {
    const msStr = String(ms).padStart(3, '0');
    return `${hStr}:${mStr}:${sStr},${msStr}`;
  }
  return `${hStr}:${mStr}:${sStr}`;
}

export function toSrt(segments: TranscriptionSegment[]): string {
  return segments
    .map((seg) => {
      const start = formatTimestamp(seg.startTime, true);
      const end = formatTimestamp(seg.endTime, true);
      return `${seg.index + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join('\n\n');
}

export function toTimestampedText(segments: TranscriptionSegment[]): string {
  return segments.map((seg) => `[${formatTimestamp(seg.startTime)}] ${seg.text}`).join('\n');
}
