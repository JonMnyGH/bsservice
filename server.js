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

    console.log('API Response (raw):', JSON.stringify(rawResponse, null, 2));

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
    const locationId = req.params.locationId;
    const newAddress = req.body.address;

    // Validate that address data is provided
    if (!newAddress) {
      return res.status(400).json({ error: 'Address data is required' });
    }

    // Parse the address string (basic splitting, assumes format: "Street, City, State ZIP")
    let parsedAddress;
    if (typeof newAddress === 'string') {
      const parts = newAddress.split(',').map(part => part.trim());
      if (parts.length < 3) {
        return res.status(400).json({ error: 'Invalid address format' });
      }
      const [street, city, stateZip] = parts;
      const stateZipParts = stateZip.split(' ');
      const state = stateZipParts[0];
      const zip = stateZipParts[1] || '';
      parsedAddress = {
        address_line_1: street,
        address_line_2: '', // Optional, can be added if needed
        locality: city,
        administrative_district_level_1: state,
        postal_code: zip,
        country: 'US' // Hardcode or derive based on logic
      };
    } else {
      parsedAddress = newAddress; // Assume it's already structured
    }

    // Retrieve the current location to preserve existing fields
    const retrieveResponse = await client.locationsApi.retrieveLocation(locationId);
    const currentLocation = retrieveResponse.result.location;

    // Create the updated location object, only changing the address
    const updatedLocation = {
      ...currentLocation,
      address: {
        address_line_1: parsedAddress.address_line_1,
        address_line_2: parsedAddress.address_line_2 || '',
        locality: parsedAddress.locality,
        administrative_district_level_1: parsedAddress.administrative_district_level_1,
        postal_code: parsedAddress.postal_code,
        country: parsedAddress.country
      }
    };

    // Update the location using the Square API
    const updateResponse = await client.locationsApi.updateLocation(locationId, { location: updatedLocation });
    const updatedLocationResult = updateResponse.result.location;

    // Send the updated location as the response
    res.json(updatedLocationResult);
  } catch (error) {
    console.error('Error updating location:', error);
    if (error.response) {
      console.error('Response Data:', stringifyBigInt(error.response.data));
      res.status(500).json({ error: 'Failed to update location', details: error.response.data });
    } else {
      res.status(500).json({ error: 'Failed to update location' });
    }
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