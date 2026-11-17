const http = require('node:http');
const { OAuth2Client } = require('google-auth-library');

const defaultAudience = '/projects/201316386962/locations/europe-central2/services/hello-git';

function createServer({
  authClient = new OAuth2Client(),
  audience = process.env.IAP_AUDIENCE || defaultAudience,
} = {}) {
  return http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'private, no-store');

    const assertion = request.headers['x-goog-iap-jwt-assertion'];
    if (typeof assertion !== 'string' || !assertion) {
      response.writeHead(401);
      response.end('Sign in through Identity-Aware Proxy.\n');
      return;
    }

    try {
      const { pubkeys } = await authClient.getIapPublicKeys();
      const ticket = await authClient.verifySignedJwtWithCertsAsync(
        assertion,
        pubkeys,
        audience,
        ['https://cloud.google.com/iap'],
      );
      const identity = ticket.getPayload();
      if (!identity || typeof identity.email !== 'string' || !identity.email ||
          typeof identity.sub !== 'string' || !identity.sub) {
        throw new Error('Missing user identity');
      }

      response.writeHead(200);
      response.end(`Hello, ${identity.email}!\n`);
    } catch {
      response.writeHead(403);
      response.end('Unable to verify your IAP identity.\n');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Listening on port ${port}`);
  });
}

module.exports = { createServer };
