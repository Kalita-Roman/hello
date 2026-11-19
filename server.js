const http = require('node:http');
const { Firestore, Timestamp } = require('@google-cloud/firestore');

const healthCallType = 'health-call';

function createServer(collection, now = () => Timestamp.now()) {
  return http.createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');

    if (request.method === 'GET' && pathname === '/api/health') {
      try {
        await collection.add({ type: healthCallType, calledAt: now() });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ status: 'ok' }));
      } catch (error) {
        console.error('Failed to record health call:', error);
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ status: 'error' }));
      }
      return;
    }

    if (pathname === '/') {
      try {
        const snapshot = await collection.orderBy('calledAt', 'desc').get();
        const timestamps = snapshot.docs
          .map((doc) => doc.data())
          .filter((data) => data.type === healthCallType)
          .map((data) => data.calledAt.toDate().toISOString());
        const history = timestamps.length
          ? `<ul>${timestamps.map((timestamp) => `<li>${timestamp}</li>`).join('')}</ul>`
          : '<p>No health calls recorded yet.</p>';

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<!DOCTYPE html>\n<html><head><title>Hello</title></head><body style="background-color: black; color: white"><h1>Hello, World!</h1><h2>Health call history (UTC)</h2>${history}</body></html>\n`);
      } catch (error) {
        console.error('Failed to load health call history:', error);
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Unable to load health call history.\n');
      }
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found\n');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const firestore = new Firestore({
    projectId: 'the-multi-tool',
    databaseId: 'the-multi-tool',
  });

  createServer(firestore.collection('hello')).listen(port, '0.0.0.0', () => {
    console.log(`Listening on port ${port}`);
  });
}

module.exports = { createServer };
