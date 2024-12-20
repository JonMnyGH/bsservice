const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json()); // Parse incoming JSON payloads

const SQUARE_WEBHOOK_SECRET = process.env.SQUARE_WEBHOOK_SECRET;

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-square-signature'];
  const body = JSON.stringify(req.body);

  // Verify the Square webhook signature
  const hmac = crypto.createHmac('sha256', SQUARE_WEBHOOK_SECRET).update(body).digest('base64');
  if (signature !== hmac) {
    return res.status(400).send('Invalid signature');
  }

  console.log('Webhook received:', req.body);

  // Forward webhook data to your Expo app via REST API or Push Notifications
  try {
    // Option 1: Send data to Expo app via your API
    await axios.post('https://your-draftbit-backend.com/api/updates', req.body);

    // Option 2: Send a push notification to the Expo app
    // (If using Firebase Cloud Messaging or Expo Notifications)
    // const { Expo } = require('expo-server-sdk');
    // const expo = new Expo();
    // await expo.sendPushNotificationsAsync([{
    //   to: 'ExponentPushToken[xxxxx]', // Use the recipient's token
    //   body: 'You have a new update!',
    //   data: req.body
    // }]);
  } catch (err) {
    console.error('Error forwarding webhook data:', err);
  }

  // Acknowledge receipt of the webhook
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
