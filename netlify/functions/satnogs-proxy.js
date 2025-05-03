const axios = require('axios');

// --- Configuration from Environment Variables ---
const SATNOGS_NETWORK_API_URL = process.env.SATNOGS_NETWORK_API_URL || 'https://network.satnogs.org/api';
const SATNOGS_DB_API_URL = process.env.SATNOGS_DB_API_URL || 'https://db.satnogs.org/api';

const isDevelopment = process.env.CONTEXT === 'dev';
const productionAllowedOrigin = process.env.ALLOWED_ORIGIN_URL;
const ALLOWED_ORIGIN = isDevelopment ? '*' : (productionAllowedOrigin || '*');

console.log(`Netlify Context: ${process.env.CONTEXT}`);
console.log(`Allowed Origin Set To: ${ALLOWED_ORIGIN}`);
console.log(`Using Network API Base: ${SATNOGS_NETWORK_API_URL}`);
console.log(`Using DB API Base: ${SATNOGS_DB_API_URL}`);

// CORS headers dynamically
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event, context) => {
  // --- CORS Preflight Request Handling (OPTIONS method) ---
  if (event.httpMethod === 'OPTIONS') {
    console.log('Received OPTIONS preflight request');
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // --- Request Handling (GET) ---
  if (event.httpMethod !== 'GET') {
    console.log(`Unsupported method: ${event.httpMethod}`);
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Method ${event.httpMethod} Not Allowed` }),
    };
  }

  // --- Path Parsing and Routing ---
  const pathSegments = event.path.split('/').filter(segment => segment !== '');
  if (pathSegments.length < 3 || pathSegments[0] !== 'api') {
    console.log(`Invalid path structure: ${event.path}`);
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Not Found: Invalid API path structure. Expected /api/network/... or /api/db/...` }),
    };
  }

  const apiType = pathSegments[1];
  const remainingPath = '/' + pathSegments.slice(2).join('/');

  // Validate API type
  if (apiType !== 'network' && apiType !== 'db') {
    console.log(`Unsupported API type: ${apiType} in path: ${event.path}`);
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Not Found: API type '${apiType}' is not supported. Use 'network' or 'db'.` }),
    };
  }

  // --- Prepare and Execute API Request ---
  let targetBaseUrl;
  if (apiType === 'network') {
    targetBaseUrl = SATNOGS_NETWORK_API_URL;
  } else { // It must be 'db'
    targetBaseUrl = SATNOGS_DB_API_URL;
  }

  const targetUrl = `${targetBaseUrl}${remainingPath}`;
  const queryParams = event.queryStringParameters;

  console.log(`Proxying [${apiType}] request to: ${targetUrl} with params:`, queryParams || {});

  try {
    const response = await axios.get(targetUrl, {
      params: queryParams,
      timeout: 15000,
      headers: { 'Accept': 'application/json' },
      validateStatus: () => true, // Handle all statuses by controlling the response
    });

    console.log(`SatNOGS response status: ${response.status}`);
    console.log(`SatNOGS response Content-Type: ${response.headers['content-type']}`);

    // --- Handle Non-Successful Status Codes from SatNOGS ---
    if (response.status >= 400) {
      console.log(`SatNOGS returned error status ${response.status} for ${targetUrl}`);
      let errorMessage = `Error fetching data from SatNOGS. Status: ${response.status}.`;
      if (response.status === 404) {
        errorMessage = `Not Found: The requested resource was not found on the SatNOGS ${apiType} API.`;
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = `Unauthorized: Access denied by SatNOGS ${apiType} API.`;
      }

      return {
        statusCode: response.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: errorMessage, upstreamStatus: response.status }),
      };
    }

    // --- Handle Successful (2xx) Responses from SatNOGS ---
    const responseHeaders = { ...CORS_HEADERS };
    const contentType = response.headers['content-type'];
    const looksLikeJson = contentType && contentType.includes('application/json');

    if (looksLikeJson) {
      responseHeaders['Content-Type'] = 'application/json';
    } else if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    } else {
      responseHeaders['Content-Type'] = 'application/octet-stream';
    }

    const responseBody = looksLikeJson ? JSON.stringify(response.data) : response.data;

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
    };

  } catch (error) {
    // Handle errors during the axios request execution
    console.error(`Error executing axios request to ${targetUrl}:`, error.message);
    const errorHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
    let statusCode = 500;
    let message = `Internal Server Error processing the request for ${event.path}.`;

    if (error.code === 'ECONNABORTED') {
      statusCode = 504; // Gateway Timeout
      message = `Gateway Timeout: No timely response from SatNOGS API for ${event.path}.`;
    } else if (error.request) {
      statusCode = 502; // Bad Gateway
      message = `Bad Gateway: Error communicating with SatNOGS API for ${event.path}.`;
    }

    return {
      statusCode: statusCode,
      headers: errorHeaders,
      body: JSON.stringify({ message: message }),
    };
  }
};
