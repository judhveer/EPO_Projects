const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

export async function sendTelegramMessage(chatId, text) {

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram API errorL ${res.status} - ${errText} `);
    }

    console.log(`Sent Telegram message to ${chatId}: ${text}`);
  }
  catch (error) {
    console.error('Error sending Telegram message:', error);
    // Retry sending the message after 5 seconds
    setTimeout(() => {
      sendTelegramMessage(chatId, text);
    }, 5000);
  }

}

