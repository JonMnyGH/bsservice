const express = require('express');
const { Client } = require('square');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Square Access Token
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;

// Initialize the Square client
const client = new Client({
  accessToken: SQUARE_ACCESS_TOKEN,
  accessToken:'EAAAljYE6GZcJFjGzs5xGc4bj3c62iBp3FgWjBKXHAN0HJGLz-CHdh1FrE3EoCd3',
});

// Helper function to get the RFC 3339 date range for the past 24 hours in Eastern Time
const getTodaysDateRangeRFC3339 = () => {
  const now = new Date();

  // Determine the UTC offset for Eastern Time (standard: -5 hours, DST: -4 hours)
  const isDST = now.getTimezoneOffset() < -300; // Daylight Saving Time check
  const offsetHours = isDST ? 4 : 5;

  // Adjust current time to Eastern Time
  const nowInET = new Date(now.getTime() - offsetHours * 3600 * 1000);

  // Start of the day in Eastern Time
  const startOfDayInET = new Date(nowInET.getFullYear(), nowInET.getMonth(), nowInET.getDate());

  // End of the day in Eastern Time (23:59:59.999)
  const endOfDayInET = new Date(startOfDayInET.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Convert start and end times back to UTC for API
  const startAt = new Date(startOfDayInET.getTime() + offsetHours * 3600 * 1000).toISOString();
  const endAt = new Date(endOfDayInET.getTime() + offsetHours * 3600 * 1000).toISOString();

  console.log('Generated Today’s Date Range (Eastern Time):', { startAt, endAt });

  return { startAt, endAt };
};

// Helper function to deeply convert BigInt values to strings
const stringifyBigInt = (obj) => {
  if (typeof obj === 'bigint') {
    return obj.toString();
  } else if (Array.isArray(obj)) {
    return obj.map(item => stringifyBigInt(item));
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, stringifyBigInt(value)])
    );
  } else {
    return obj;
  }
};

app.get('/api/orders', async (req, res) => {
  try {
    // Get location IDs from Square
    const locationResponse = await client.locationsApi.listLocations();
    const locationIds = locationResponse.result.locations.map(location => location.id);

    // Get the date range for today
    const { startAt, endAt } = getTodaysDateRangeRFC3339();

    // Construct the request payload
    const requestBody = {
      locationIds,
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt,
              endAt,
            },
          },
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'DESC',
        },
      },
    };

    console.log('Request Body:', JSON.stringify(requestBody, null, 2));

    // Search orders within the date range
    const response = await client.ordersApi.searchOrders(requestBody);

    // Convert BigInt values to strings before logging
    const rawResponse = stringifyBigInt(response.result);

     

    const orders = rawResponse.orders || [];
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);

    if (error.response) {
      console.error('Response Data:', stringifyBigInt(error.response.data));
    }

    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

 
app.put('/api/locations/:locationId', async (req, res) => {
  try {
    // Log the incoming request
    console.log('Incoming Request:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: stringifyBigInt(req.body)
    });

    const locationId = req.params.locationId;
    const newAddress = req.body.address;

    // Validate that address data is provided and has required fields
    if (!newAddress || typeof newAddress !== 'object') {
      console.error('Invalid address: Address must be an object');
      return res.status(400).json({ error: 'Structured address data is required' });
    }

    const requiredFields = ['address_line_1', 'locality', 'administrative_district_level_1', 'postal_code', 'country'];
    const missingFields = requiredFields.filter(field => !newAddress[field]);
    if (missingFields.length > 0) {
      console.error('Missing required address fields:', missingFields);
      return res.status(400).json({ error: `Missing required address fields: ${missingFields.join(', ')}` });
    }

    // Retrieve the current location to preserve existing fields
    const retrieveResponse = await client.locationsApi.retrieveLocation(locationId);
    const currentLocation = retrieveResponse.result.location;
    console.log('Current Location:', stringifyBigInt(currentLocation));

    // Create the updated location object with only necessary fields
    const updatedLocation = {
      name: currentLocation.name, // Preserve name
      address: {
        address_line_1: 'newAddress.address_line_1',
        address_line_2: newAddress.address_line_2 || '',
        locality: newAddress.locality,
        administrative_district_level_1: newAddress.administrative_district_level_1,
        postal_code: newAddress.postal_code,
        country: newAddress.country
      }
    };

    // Log the exact payload being sent to Square
    const requestPayload = { location: updatedLocation };
    console.log('Square API Request:', stringifyBigInt(requestPayload));

    // Update the location using the Square API
    const updateResponse = await client.locationsApi.updateLocation(locationId, requestPayload);
    const updatedLocationResult = updateResponse.result.location;

    // Log the Square API response
    console.log('Square API Response:', stringifyBigInt(updatedLocationResult));

    // Send the updated location as the response
    res.json(updatedLocationResult);
  } catch (error) {
    console.error('Error updating location:', error);
    if (error.response) {
      console.error('Response Data:', stringifyBigInt(error.response.data));
    }
    res.status(500).json({ error: 'Failed to update location', details: error.response?.data });
  }
});

// Serve the React app's static files from the 'build' directory
app.use(express.static(path.join(__dirname, 'build')));

// Fallback to serve React's index.html for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});