// src/api/api4.ts
// Webhook integration for chat assistant

export async function sendToWebhook(question: string): Promise<string> {
  const url = "https://n8n.srv880406.hstgr.cloud/webhook/18543cff-f795-4d75-a9d3-991914f6e84c";
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) throw new Error('Webhook error');
    const data = await response.json();
    // Adjust this if your webhook returns a different property
    return data.reply || data.answer || JSON.stringify(data);
  } catch (err: any) {
    return 'Webhook error: ' + (err.message || 'Unknown error');
  }
}
