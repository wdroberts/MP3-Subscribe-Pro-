import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

export interface AudioMeta {
  sampleRateHertz: number;
  durationSeconds: number;
}

export function convertToLinear16(inputPath: string, outputDir: string): Promise<AudioMeta> {
  const outputPath = path.join(outputDir, 'audio.wav');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => {
        // Get duration from the output file
        ffmpeg.ffprobe(outputPath, (err, metadata) => {
          if (err) return reject(err);
          resolve({
            sampleRateHertz: 16000,
            durationSeconds: metadata.format.duration || 0,
          });
        });
      })
      .on('error', reject)
      .save(outputPath);
  });
}

export function validateMp3(filepath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (err) {
        console.error('ffprobe validation failed for', filepath, ':', err.message);
        return resolve(false);
      }
      const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
      if (!hasAudio) {
        console.error('No audio stream found in', filepath,
          '— streams:', metadata.streams.map((s) => s.codec_type));
      }
      resolve(hasAudio);
    });
  });
}

export function getConvertedPath(uploadDir: string): string {
  return path.join(uploadDir, 'audio.wav');
}
