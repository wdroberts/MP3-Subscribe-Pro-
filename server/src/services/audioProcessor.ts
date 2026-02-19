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
    // First try ffprobe (fast metadata check)
    ffmpeg.ffprobe(filepath, (err, metadata) => {
      if (!err) {
        const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
        if (hasAudio) return resolve(true);
        console.error('No audio stream found in', filepath,
          '— streams:', metadata.streams.map((s) => s.codec_type));
        return resolve(false);
      }

      // ffprobe failed — try a quick ffmpeg read as fallback
      // (ffmpeg is more lenient with non-standard headers)
      console.warn('ffprobe failed for', filepath, ':', err.message, '— trying ffmpeg fallback');
      ffmpeg(filepath)
        .audioCodec('pcm_s16le')
        .format('null')
        .duration(0.1)
        .on('end', () => resolve(true))
        .on('error', (ffmpegErr) => {
          console.error('ffmpeg fallback also failed for', filepath, ':', ffmpegErr.message);
          resolve(false);
        })
        .save('/dev/null');
    });
  });
}

export function getConvertedPath(uploadDir: string): string {
  return path.join(uploadDir, 'audio.wav');
}

/** Fast metadata probe — gets duration without converting the file */
export function probeAudioMeta(inputPath: string): Promise<AudioMeta> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve({
        sampleRateHertz: 16000,
        durationSeconds: metadata.format.duration || 0,
      });
    });
  });
}
