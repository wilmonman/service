// netlify/functions/satnogs-proxy.js

exports.handler = async (event, context) => {
  // Log that the function was invoked
  console.log("SatNOGS proxy test function invoked!");

  // Log details about the request event for debugging
  console.log("Received HTTP Method:", event.httpMethod);
  console.log("Received Path:", event.path);
  console.log("Received Query Parameters:", event.queryStringParameters);

  // Prepare a simple JSON response body
  const responseBody = {
    message: "Success! Netlify function 'satnogs-proxy' is running.",
    status: "Test OK",
    invokedAt: new Date().toISOString(), // Add a timestamp
    // Echo back some request details
    requestedPath: event.path,
    requestedQueryParams: event.queryStringParameters || null, // Show query params if they exist
  };

  // Return a successful response
  return {
    statusCode: 200,
    headers: {
      // Set headers: Content-Type is important for JSON.
      // Allow requests from any origin ('*') for testing CORS from Render.
      // You might restrict this later to your Render app's specific domain.
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Allow all origins for testing
      'Access-Control-Allow-Headers': 'Content-Type', // Headers allowed in requests
      'Access-Control-Allow-Methods': 'GET', // Methods allowed
    },
    body: JSON.stringify(responseBody), // Remember to stringify the body
  };
};
