const http = require('node:http');

const port = Number(process.env.PORT || 8080);

http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!DOCTYPE html>\n<html><head><title>Hello</title></head><body style="background-color: black; color: white"><h1>Hello, World!</h1></body></html>\n');
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not Found\n');
}).listen(port, '0.0.0.0', () => {
  console.log(`Listening on port ${port}`);
});
