import http from 'http';
import fs from 'fs';
import path from 'path';

const TARGET_PORT = parseInt(process.env.TARGET_PORT || '8090', 10);
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || '8091', 10);
const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'recorded_traffic.jsonl');
const PRETTY_LOG_FILE = process.env.PRETTY_LOG_FILE || path.join(process.cwd(), 'recorded_traffic.log');

console.log(`\x1b[1;36m[AGY Proxy Logger]\x1b[0m Listening on port \x1b[1;32m${LISTEN_PORT}\x1b[0m -> Forwarding to \x1b[1;33m${TARGET_PORT}\x1b[0m`);
console.log(`\x1b[90mLogging JSONL to: ${LOG_FILE}\x1b[0m`);
console.log(`\x1b[90mLogging Pretty Text to: ${PRETTY_LOG_FILE}\x1b[0m\n`);

// Helper to decode gRPC-Web frames from Buffer
function parseGrpcWebFrames(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const flag = buf[offset];
    const len = buf.readUInt32BE(offset + 1);
    if (offset + 5 + len > buf.length) break;
    const payload = buf.subarray(offset + 5, offset + 5 + len);
    offset += 5 + len;
    
    let json = null;
    const rawStr = payload.toString('utf-8');
    try {
      json = JSON.parse(rawStr);
    } catch {
      json = rawStr;
    }
    frames.push({ flag: flag === 0x80 ? 'TRAILER' : 'DATA', length: len, payload: json });
  }
  return { frames, remainder: buf.subarray(offset) };
}

function writeLog(entry) {
  // Write JSONL
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

  // Write Pretty log
  const prettyHeader = `================================================================================\n` +
    `[${entry.timestamp}] ${entry.method} ${entry.url}\n` +
    `Headers: ${JSON.stringify(entry.headers)}\n` +
    `-------------------------------- REQUEST ---------------------------------------\n` +
    JSON.stringify(entry.requestPayload, null, 2) + '\n' +
    `-------------------------------- RESPONSE STREAM -------------------------------\n`;

  let prettyBody = '';
  if (Array.isArray(entry.responseFrames)) {
    entry.responseFrames.forEach((frame, i) => {
      prettyBody += `--- Frame #${i + 1} (${frame.flag}, len: ${frame.length}) ---\n` +
        JSON.stringify(frame.payload, null, 2) + '\n';
    });
  } else {
    prettyBody += JSON.stringify(entry.responsePayload || '', null, 2) + '\n';
  }
  
  fs.appendFileSync(PRETTY_LOG_FILE, prettyHeader + prettyBody + '\n\n');
}

const server = http.createServer((req, res) => {
  const requestId = Math.random().toString(36).substring(2, 9);
  const timestamp = new Date().toISOString();
  const endpoint = req.url;

  let reqChunks = [];
  req.on('data', chunk => reqChunks.push(chunk));

  req.on('end', () => {
    const reqBuffer = Buffer.concat(reqChunks);
    
    // Parse request payload
    let requestPayload = null;
    if (reqBuffer.length >= 5 && req.headers['content-type']?.includes('grpc-web')) {
      const { frames } = parseGrpcWebFrames(reqBuffer);
      requestPayload = frames.length === 1 ? frames[0].payload : frames.map(f => f.payload);
    } else if (reqBuffer.length > 0) {
      try {
        requestPayload = JSON.parse(reqBuffer.toString('utf-8'));
      } catch {
        requestPayload = reqBuffer.toString('utf-8');
      }
    }

    console.log(`\x1b[1;35m[--> REQ ${requestId}]\x1b[0m \x1b[1;37m${req.method}\x1b[0m \x1b[36m${endpoint}\x1b[0m`);
    if (requestPayload) {
      const summaryStr = JSON.stringify(requestPayload);
      console.log(`  \x1b[90mBody:\x1b[0m ${summaryStr.length > 150 ? summaryStr.slice(0, 150) + '...' : summaryStr}`);
    }

    // Forward request to target agy daemon
    const options = {
      hostname: '127.0.0.1',
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${TARGET_PORT}` }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      const responseFrames = [];
      let resBuffer = Buffer.alloc(0);

      proxyRes.on('data', chunk => {
        res.write(chunk);
        resBuffer = Buffer.concat([resBuffer, Buffer.from(chunk)]);

        if (req.headers['content-type']?.includes('grpc-web')) {
          const { frames, remainder } = parseGrpcWebFrames(resBuffer);
          if (frames.length > 0) {
            frames.forEach(f => responseFrames.push(f));
            resBuffer = remainder;
          }
        }
      });

      proxyRes.on('end', () => {
        res.end();
        console.log(`\x1b[1;32m[<-- RES ${requestId}]\x1b[0m \x1b[37m${proxyRes.statusCode}\x1b[0m (${responseFrames.length} frames logged)`);

        // Save complete trace
        writeLog({
          requestId,
          timestamp,
          method: req.method,
          url: req.url,
          headers: req.headers,
          requestPayload,
          responseStatus: proxyRes.statusCode,
          responseFrames: responseFrames.length > 0 ? responseFrames : undefined,
          responseRaw: responseFrames.length === 0 ? resBuffer.toString('utf-8') : undefined
        });
      });
    });

    proxyReq.on('error', (err) => {
      console.error(`\x1b[1;31m[PROXY ERROR ${requestId}]\x1b[0m`, err.message);
      res.statusCode = 502;
      res.end(`Proxy Error: ${err.message}`);
    });

    proxyReq.write(reqBuffer);
    proxyReq.end();
  });
});

server.listen(LISTEN_PORT, () => {
  console.log(`\x1b[1;32m✓ Proxy recorder is live on http://127.0.0.1:${LISTEN_PORT}\x1b[0m`);
});
