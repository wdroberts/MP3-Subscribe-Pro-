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
        ffmpeg.ffprobe(outputPath, async (err, metadata) => {
          if (err) return reject(err);
          let duration = metadata.format.duration || 0;

          // WAV duration from ffprobe can occasionally be 0 for certain
          // encodings.  Fall back to computing from raw PCM size:
          // WAV LINEAR16 mono 16 kHz = 32 000 bytes/sec
          if (duration <= 0) {
            try {
              const fsP = await import('fs/promises');
              const stat = await fsP.stat(outputPath);
              // Subtract 44-byte WAV header
              duration = Math.max(0, stat.size - 44) / (16000 * 2);
            } catch {
              // leave as 0
            }
          }

          resolve({
            sampleRateHertz: 16000,
            durationSeconds: duration,
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
    ffmpeg.ffprobe(inputPath, async (err, metadata) => {
      if (err) return reject(err);
      let duration = metadata.format.duration || 0;

      // Some MP3 files (especially VBR) report duration as 0 from ffprobe.
      // Fall back to estimating from file size and bitrate.
      if (duration <= 0) {
        const bitRate = metadata.format.bit_rate;
        const size = metadata.format.size;
        if (bitRate && size) {
          duration = Number(size) * 8 / Number(bitRate);
        }
      }

      // If still 0, estimate from file size assuming 128 kbps MP3
      if (duration <= 0) {
        try {
          const fs = await import('fs/promises');
          const stat = await fs.stat(inputPath);
          duration = (stat.size * 8) / 128000;
        } catch {
          // leave as 0 — will be handled downstream
        }
      }

      resolve({
        sampleRateHertz: 16000,
        durationSeconds: duration,
      });
    });
  });
}
