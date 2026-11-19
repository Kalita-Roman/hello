const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { Timestamp } = require('@google-cloud/firestore');
const { createServer } = require('./server');

function fakeCollection(initial = []) {
  const records = [...initial];
  return {
    records,
    async add(record) {
      records.push(record);
    },
    orderBy(field, direction) {
      assert.equal(field, 'calledAt');
      assert.equal(direction, 'desc');
      return {
        async get() {
          return {
            docs: records
              .filter((record) => record.calledAt)
              .sort((a, b) => b.calledAt.toMillis() - a.calledAt.toMillis())
              .map((record) => ({ data: () => record })),
          };
        },
      };
    },
  };
}

async function withServer(collection, run, now) {
  const server = createServer(collection, now);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health calls are stored before returning the existing success response', async () => {
  const collection = fakeCollection();
  const timestamp = Timestamp.fromDate(new Date('2026-01-02T03:04:05.000Z'));

  await withServer(collection, async (url) => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.deepEqual(collection.records, [{ type: 'health-call', calledAt: timestamp }]);
  }, () => timestamp);
});

test('health returns an error when the write fails', async () => {
  const collection = fakeCollection();
  collection.add = async () => { throw new Error('write failed'); };

  await withServer(collection, async (url) => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { status: 'error' });
  });
});

test('recorded calls appear on the home page newest first', async () => {
  const collection = fakeCollection();
  const times = [
    Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),
    Timestamp.fromDate(new Date('2026-01-02T00:00:00Z')),
  ];

  await withServer(collection, async (url) => {
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    const response = await fetch(url);
    const html = await response.text();
    assert.match(html, /2026-01-01T00:00:00\.000Z/);
    assert.match(html, /2026-01-02T00:00:00\.000Z/);
    assert.ok(html.indexOf('2026-01-02') < html.indexOf('2026-01-01'));
    assert.equal(collection.records.length, 2);
  }, () => times.shift());
});

test('home shows only health calls in newest-first order without recording a call', async () => {
  const collection = fakeCollection([
    { type: 'health-call', calledAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')) },
    { type: 'other', calledAt: Timestamp.fromDate(new Date('2026-01-03T00:00:00Z')) },
    { type: 'health-call', calledAt: Timestamp.fromDate(new Date('2026-01-02T00:00:00Z')) },
    { unrelated: true },
  ]);

  await withServer(collection, async (url) => {
    const response = await fetch(url);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Hello, World!/);
    assert.match(html, /2026-01-02T00:00:00\.000Z/);
    assert.match(html, /2026-01-01T00:00:00\.000Z/);
    assert.ok(html.indexOf('2026-01-02') < html.indexOf('2026-01-01'));
    assert.doesNotMatch(html, /2026-01-03/);
    assert.equal(collection.records.length, 4);
  });
});

test('home displays an empty state when there are no health calls', async () => {
  await withServer(fakeCollection(), async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /No health calls recorded yet/);
  });
});

test('home reports Firestore read failures', async () => {
  const collection = fakeCollection();
  collection.orderBy = () => ({ get: async () => { throw new Error('read failed'); } });

  await withServer(collection, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /Unable to load health call history/);
  });
});

test('other routes and non-GET health requests remain not found', async () => {
  const collection = fakeCollection();
  await withServer(collection, async (url) => {
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal((await fetch(`${url}/api/health`, { method: 'POST' })).status, 404);
    assert.equal(collection.records.length, 0);
  });
});
