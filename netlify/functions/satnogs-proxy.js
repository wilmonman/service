// netlify/functions/api.js (or your chosen filename)
const axios = require('axios');

// --- Configuration from Environment Variables ---
// Default URLs if environment variables are not set
const SATNOGS_NETWORK_API_URL = process.env.SATNOGS_NETWORK_API_URL || 'https://network.satnogs.org/api';
const SATNOGS_DB_API_URL = process.env.SATNOGS_DB_API_URL || 'https://db.satnogs.org/api';

// Determine allowed origin based on Netlify context
const isDevelopment = process.env.CONTEXT === 'development'; // Check if context is 'development' (local dev)
const productionAllowedOrigin = process.env.ALLOWED_ORIGIN_URL; // Your production site URL (e.g., https://yoursite.netlify.app)
// Allow any origin in local dev, restrict in production if URL is set, fallback to '*' if not set (less secure)
const ALLOWED_ORIGIN = isDevelopment ? '*' : (productionAllowedOrigin || '*');

// Log configuration on function startup
console.log(`Netlify Context: ${process.env.CONTEXT}`);
console.log(`Allowed Origin Set To: ${ALLOWED_ORIGIN}`);
console.log(`Using Network API Base: ${SATNOGS_NETWORK_API_URL}`);
console.log(`Using DB API Base: ${SATNOGS_DB_API_URL}`);

// Base CORS headers - dynamically set origin
const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Accept', // Add any other headers your frontend might send
  'Access-Control-Allow-Methods': 'GET, OPTIONS', // Only allow GET and OPTIONS
};

// Headers that the browser is allowed to access from the response
// Start with common ones, 'Link' will be added dynamically if present
const EXPOSED_HEADERS = 'Content-Type, Content-Length'; // Add others if needed, e.g., 'X-Total-Count'

exports.handler = async (event, context) => {
  // --- CORS Preflight Request Handling (OPTIONS method) ---
  if (event.httpMethod === 'OPTIONS') {
    console.log('Received OPTIONS preflight request');
    return {
      statusCode: 204, // No Content
      headers: BASE_CORS_HEADERS,
      body: '',
    };
  }

  // --- Request Handling (Only GET allowed) ---
  if (event.httpMethod !== 'GET') {
    console.log(`Unsupported method: ${event.httpMethod}`);
    return {
      statusCode: 405, // Method Not Allowed
      headers: { ...BASE_CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Method ${event.httpMethod} Not Allowed` }),
    };
  }

  // --- Path Parsing and Routing ---
  // Example path: /api/network/observations?param=value -> segments = ['api', 'network', 'observations']
  const pathSegments = event.path.split('/').filter(segment => segment !== '');
  if (pathSegments.length < 3 || pathSegments[0] !== 'api') {
    console.log(`Invalid path structure: ${event.path}`);
    return {
      statusCode: 404, // Not Found
      headers: { ...BASE_CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Not Found: Invalid API path structure. Expected /api/network/... or /api/db/...` }),
    };
  }

  const apiType = pathSegments[1]; // 'network' or 'db'
  const remainingPath = '/' + pathSegments.slice(2).join('/'); // e.g., '/observations' or '/stations'

  // Validate API type
  let targetBaseUrl;
  if (apiType === 'network') {
    targetBaseUrl = SATNOGS_NETWORK_API_URL;
  } else if (apiType === 'db') {
    targetBaseUrl = SATNOGS_DB_API_URL;
  } else {
    console.log(`Unsupported API type: ${apiType} in path: ${event.path}`);
    return {
      statusCode: 404, // Not Found
      headers: { ...BASE_CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Not Found: API type '${apiType}' is not supported. Use 'network' or 'db'.` }),
    };
  }

  // --- Prepare and Execute API Request ---
  const targetUrl = `${targetBaseUrl}${remainingPath}`;
  const queryParams = event.queryStringParameters;

  console.log(`Proxying [${apiType}] request to: ${targetUrl} with params:`, queryParams || {});

  try {
    // Make the request to the target SatNOGS API
    const response = await axios.get(targetUrl, {
      params: queryParams,
      timeout: 15000, // 15 second timeout
      headers: { 'Accept': 'application/json' }, // Request JSON
      validateStatus: () => true, // Handle all HTTP statuses manually
    });

    console.log(`SatNOGS response status: ${response.status}`);
    console.log(`SatNOGS response Content-Type: ${response.headers['content-type']}`);
    console.log(`SatNOGS response Link header: ${response.headers['link']}`); // Log the Link header

    // Prepare headers for the response back to the browser
    const responseHeaders = { ...BASE_CORS_HEADERS };
    let exposedHeaders = EXPOSED_HEADERS; // Start with default exposed headers

    // --- Handle Non-Successful Status Codes from SatNOGS (4xx, 5xx) ---
    if (response.status >= 400) {
      console.log(`SatNOGS returned error status ${response.status} for ${targetUrl}`);
      let errorMessage = `Error fetching data from SatNOGS. Status: ${response.status}.`;
      // Add more specific messages if needed
      if (response.status === 404) errorMessage = `Not Found: The requested resource was not found on the SatNOGS ${apiType} API.`;
      // ... other specific status code messages

      // Set Content-Type for the error response
      responseHeaders['Content-Type'] = 'application/json';

      // Copy Link header even on error, if present (though less likely)
      if (response.headers['link']) {
          responseHeaders['Link'] = response.headers['link'];
          exposedHeaders += ', Link'; // Ensure Link is exposed even on error
      }
      responseHeaders['Access-Control-Expose-Headers'] = exposedHeaders;

      return {
        statusCode: response.status, // Return the original error status
        headers: responseHeaders,
        body: JSON.stringify({ message: errorMessage, upstreamStatus: response.status }),
      };
    }

    // --- Handle Successful (2xx) Responses from SatNOGS ---

    // Set Content-Type based on SatNOGS response
    const contentType = response.headers['content-type'];
    if (contentType) {
        responseHeaders['Content-Type'] = contentType;
    } else {
        responseHeaders['Content-Type'] = 'application/octet-stream'; // Fallback
    }

    // ** Crucially, copy the Link header if it exists **
    const linkHeader = response.headers['link'];
    if (linkHeader) {
      responseHeaders['Link'] = linkHeader;
      // ** And expose it to the browser **
      exposedHeaders += ', Link';
    }
    responseHeaders['Access-Control-Expose-Headers'] = exposedHeaders;


    // Determine body format (handle potential non-JSON success responses if needed)
    const looksLikeJson = contentType && contentType.includes('application/json');
    const responseBody = looksLikeJson ? JSON.stringify(response.data) : response.data;

    // Return the successful response
    return {
      statusCode: response.status,
      headers: responseHeaders, // Return the combined headers
      body: responseBody,
    };

  } catch (error) {
    // Handle errors during the axios request execution itself (e.g., network error, timeout)
    console.error(`Error executing axios request to ${targetUrl}:`, error.message);

    // Prepare error headers
    const errorHeaders = { ...BASE_CORS_HEADERS, 'Content-Type': 'application/json' };
    // Expose default headers even on internal errors
    errorHeaders['Access-Control-Expose-Headers'] = EXPOSED_HEADERS;

    let statusCode = 500; // Internal Server Error default
    let message = `Internal Server Error processing the request for ${event.path}.`;

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      statusCode = 504; // Gateway Timeout
      message = `Gateway Timeout: No timely response from SatNOGS API for ${event.path}.`;
    } else if (error.request) {
      // Error setting up the request or no response received
      statusCode = 502; // Bad Gateway
      message = `Bad Gateway: Error communicating with SatNOGS API for ${event.path}.`;
    }
    // else: Other unexpected errors

    return {
      statusCode: statusCode,
      headers: errorHeaders, // Return error headers with CORS info
      body: JSON.stringify({ message: message }),
    };
  }
};
