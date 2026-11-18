const http = require('node:http');

const port = Number(process.env.PORT || 8080);

http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Hello, World!\n');
}).listen(port, '0.0.0.0', () => {
  console.log(`Listening on port ${port}`);
});
