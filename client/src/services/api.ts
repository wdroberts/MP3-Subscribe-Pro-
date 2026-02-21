import { UploadResult, TranscriptionResult, SummarizationResult } from '../types/index.ts';

const TOKEN_KEY = 'mp3_auth_token';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export async function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || `Upload failed (HTTP ${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${xhr.responseText.substring(0, 200)}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.open('POST', '/api/upload');

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.send(formData);
  });
}

export async function startTranscription(
  uploadId: string,
): Promise<{ id: string; status: string }> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ uploadId }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || 'Failed to start transcription');
  }

  return res.json();
}

export async function pollTranscriptionStatus(id: string): Promise<TranscriptionResult> {
  const res = await fetch(`/api/transcribe/${id}/status`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || 'Failed to get transcription status');
  }

  return res.json();
}

export async function requestSummarization(
  transcriptionId: string,
): Promise<SummarizationResult> {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ transcriptionId }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || 'Failed to generate summary');
  }

  return res.json();
}

export function getExportUrl(id: string, format: 'txt' | 'srt' | 'json'): string {
  return `/api/export/${id}/${format}`;
}
