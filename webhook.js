const express = require('express');
const crypto = require('crypto');

// Simulate a database for storing webhook data (in production, use a proper database)
const webhookEvents = [];

const app = express();
app.use(express.json()); // Middleware to parse JSON payloads

// Replace this with your Square Webhook Secret
const SQUARE_WEBHOOK_SECRET = process.env.SQUARE_WEBHOOK_SECRET;

// Endpoint to receive webhooks from Square
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-square-signature'];
  const body = JSON.stringify(req.body);

  // Verify the Square webhook signature
  const hmac = crypto.createHmac('sha256', SQUARE_WEBHOOK_SECRET).update(body).digest('base64');
  if (signature !== hmac) {
    return res.status(400).send('Invalid signature');
  }

  // Save the event to in-memory storage (or database in production)
  webhookEvents.push({
    id: req.body.id, // Unique event ID
    type: req.body.type, // Event type, e.g., 'order.created'
    data: req.body.data, // Event payload
    receivedAt: new Date(), // Timestamp of receipt
  });

  console.log('Webhook received:', req.body);

  // Respond to Square to acknowledge receipt
  res.status(200).send('OK');
});

// Endpoint for Expo app to poll for updates
app.get('/api/updates', (req, res) => {
  const { since } = req.query;

  // Filter events based on the 'since' parameter (timestamp or ID)
  let filteredEvents = webhookEvents;
  if (since) {
    filteredEvents = webhookEvents.filter(event => new Date(event.receivedAt) > new Date(since));
  }

  // Respond with the filtered events
  res.json({ updates: filteredEvents });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
