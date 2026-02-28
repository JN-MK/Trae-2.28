const http = require('http');

const data = JSON.stringify({
  message: '你好'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  
  let firstChunkReceived = false;
  
  res.on('data', (chunk) => {
    console.log(`BODY CHUNK: ${chunk.substring(0, 200)}...`); // Only print first 200 chars
    if (!firstChunkReceived) {
        firstChunkReceived = true;
        // Verify we got something valid
        if (chunk.includes('data:') || chunk.includes('error')) {
            console.log("Response looks valid.");
        }
        // Don't exit immediately, let it run a bit to see if stream works
        setTimeout(() => process.exit(0), 2000); 
    }
  });
  
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
