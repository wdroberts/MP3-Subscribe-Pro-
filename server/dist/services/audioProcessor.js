"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToLinear16 = convertToLinear16;
exports.validateMp3 = validateMp3;
exports.getConvertedPath = getConvertedPath;
exports.probeAudioMeta = probeAudioMeta;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path_1 = __importDefault(require("path"));
function convertToLinear16(inputPath, outputDir) {
    const outputPath = path_1.default.join(outputDir, 'audio.wav');
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(inputPath)
            .audioChannels(1)
            .audioFrequency(16000)
            .audioCodec('pcm_s16le')
            .format('wav')
            .on('end', () => {
            // Get duration from the output file
            fluent_ffmpeg_1.default.ffprobe(outputPath, async (err, metadata) => {
                if (err)
                    return reject(err);
                let duration = metadata.format.duration || 0;
                // WAV duration from ffprobe can occasionally be 0 for certain
                // encodings.  Fall back to computing from raw PCM size:
                // WAV LINEAR16 mono 16 kHz = 32 000 bytes/sec
                if (duration <= 0) {
                    try {
                        const fsP = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                        const stat = await fsP.stat(outputPath);
                        // Subtract 44-byte WAV header
                        duration = Math.max(0, stat.size - 44) / (16000 * 2);
                    }
                    catch {
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
function validateMp3(filepath) {
    return new Promise((resolve) => {
        // First try ffprobe (fast metadata check)
        fluent_ffmpeg_1.default.ffprobe(filepath, (err, metadata) => {
            if (!err) {
                const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
                if (hasAudio)
                    return resolve(true);
                console.error('No audio stream found in', filepath, '— streams:', metadata.streams.map((s) => s.codec_type));
                return resolve(false);
            }
            // ffprobe failed — try a quick ffmpeg read as fallback
            // (ffmpeg is more lenient with non-standard headers)
            console.warn('ffprobe failed for', filepath, ':', err.message, '— trying ffmpeg fallback');
            (0, fluent_ffmpeg_1.default)(filepath)
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
function getConvertedPath(uploadDir) {
    return path_1.default.join(uploadDir, 'audio.wav');
}
/** Fast metadata probe — gets duration without converting the file */
function probeAudioMeta(inputPath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(inputPath, async (err, metadata) => {
            if (err)
                return reject(err);
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
                    const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                    const stat = await fs.stat(inputPath);
                    duration = (stat.size * 8) / 128000;
                }
                catch {
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
//# sourceMappingURL=audioProcessor.js.map