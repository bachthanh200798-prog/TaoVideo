export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Could not read file as base64'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function assertOkResponse(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) return;

  let message = fallbackMessage;
  try {
    const data = await response.json();
    if (typeof data?.error === 'string') {
      message = data.error;
    }
  } catch {
    // Keep the supplied fallback if the response body is empty or not JSON.
  }
  throw new Error(message);
}
