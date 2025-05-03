# SatNOGS API CORS Proxy - Netlify Function

This project implements a Netlify Function that acts as a server-side proxy to bypass browser CORS (Cross-Origin Resource Sharing) restrictions when accessing the public SatNOGS APIs from a frontend web application hosted on a different domain.

## Problem Solved

Web browsers enforce the Same-Origin Policy, which prevents frontend JavaScript code from directly fetching data from APIs hosted on different domains (like `db.satnogs.org` or `network.satnogs.org`) unless the API explicitly allows it via CORS headers. Since we cannot modify the SatNOGS API servers, this proxy provides a necessary intermediary.

The frontend application makes requests to this Netlify function (hosted on the same platform or allowing the frontend's origin), and the function securely fetches the data from the appropriate SatNOGS API on the server-side and returns it to the frontend.

## Features

* Proxies requests to the two main SatNOGS API endpoints.
* Handles routing based on the request path (`/api/network/...` or `/api/db/...`).
* Forwards query parameters to the target SatNOGS API.
* Handles CORS preflight (OPTIONS) requests.
* Sets appropriate CORS headers based on the deployment environment (allows `*` in development, specific origin in production).
* Returns standardized JSON error messages for upstream API errors (like 404 Not Found from SatNOGS).
* Configurable via environment variables.

## API Routes Proxied

This function proxies GET requests made to the following path structures:

* `/api/network/*`: Routes requests to `https://network.satnogs.org/api/*`
    * Example: `/api/network/observations?satellite__norad_cat_id=25544` -> `https://network.satnogs.org/api/observations?satellite__norad_cat_id=25544`
    * Example: `/api/network/stations/123` -> `https://network.satnogs.org/api/stations/123`
* `/api/db/*`: Routes requests to `https://db.satnogs.org/api/*`
    * Example: `/api/db/satellites?norad_cat_id=25544&format=json` -> `https://db.satnogs.org/api/satellites?norad_cat_id=25544&format=json`
    * Example: `/api/db/transmitters/abc` -> `https://db.satnogs.org/api/transmitters/abc`

Requests to other paths under `/api/` or invalid structures will result in a 404 Not Found JSON response from this proxy function. Only GET requests are supported.

## Setup and Installation

### Prerequisites

* [Node.js](https://nodejs.org/) (includes npm)
* [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install netlify-cli -g`
* A Netlify account, linked to the CLI (`netlify login`)

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create `.env` file:** Create a file named `.env` in the project root (add it to `.gitignore`). For local development, it doesn't strictly need variables as the code defaults to `*` for CORS origin and uses default API URLs, but you can define them for completeness:
    ```dotenv
    # .env (Optional for local dev, required values are defaulted in code)
    # SATNOGS_NETWORK_API_URL=[https://network.satnogs.org/api](https://network.satnogs.org/api)
    # SATNOGS_DB_API_URL=[https://db.satnogs.org/api](https://db.satnogs.org/api)
    # ALLOWED_ORIGIN_URL=http://localhost:YOUR_FRONTEND_PORT
    ```
4.  **Link to Netlify Site (Optional but recommended):**
    ```bash
    netlify link
    ```
5.  **Run the local development server:**
    ```bash
    netlify dev
    ```
    The proxy function will be available at `http://localhost:8888/api/`. Test endpoints like `http://localhost:8888/api/network/observations`. Check the terminal for logs.

## Deployment to Netlify

1.  **Connect Repository:** Link this GitHub repository to a site in your Netlify account.
2.  **Configure Environment Variables:** In the Netlify UI (`Site configuration` > `Build & deploy` > `Environment`), add the following variables for the **Production** scope:
    * `SATNOGS_NETWORK_API_URL`: `https://network.satnogs.org/api`
    * `SATNOGS_DB_API_URL`: `https://db.satnogs.org/api`
    * `ALLOWED_ORIGIN_URL`: The **exact URL** of your deployed frontend application (e.g., `https://your-app.onrender.com`). **Do not include a trailing slash.**
3.  **Trigger Deployment:** Push your code to the linked GitHub branch (e.g., `main`). Netlify will automatically build and deploy the function.

## Usage from Frontend

In your frontend application, make API requests to your deployed Netlify function's URL instead of directly to SatNOGS.

* **Base URL:** `https://YOUR_NETLIFY_SITE_NAME.netlify.app/api` (replace with your actual Netlify site URL)
* **Example Fetch:**
    ```javascript
    // Example fetching satellite data
    const noradId = 25544;
    const apiUrl = `https://YOUR_NETLIFY_SITE_NAME.netlify.app/api/db/satellites?norad_cat_id=${noradId}&format=json`;

    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          // Handle non-2xx responses (like 404 from the proxy)
          console.error(`API Error: ${response.status}`);
          return response.json().then(err => Promise.reject(err)); // Try to parse error JSON
        }
        return response.json(); // Parse successful JSON response
      })
      .then(data => {
        console.log("Satellite Data:", data);
        // Use the satellite data in your app
      })
      .catch(error => {
        console.error("Failed to fetch satellite data:", error);
        // Handle fetch errors (network error, JSON parsing error, rejected promise from non-ok response)
      });
    ```

Remember to replace `YOUR_NETLIFY_SITE_NAME` with your actual site name.
