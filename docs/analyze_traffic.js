import fs from 'fs';
import path from 'path';

const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'recorded_traffic.jsonl');

if (!fs.existsSync(LOG_FILE)) {
  console.log(`\x1b[1;31mNo log file found at ${LOG_FILE}\x1b[0m`);
  console.log('Run proxy.js or agy_wrapper.js first to record RPC traffic!');
  process.exit(1);
}

const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);

console.log(`\x1b[1;35m╔════════════════════════════════════════════════════════════════════════╗\x1b[0m`);
console.log(`\x1b[1;35m║\x1b[0m \x1b[1;37m✦ RECORDED AGY RPC TRAFFIC ANALYZER (${lines.length} requests captured) ✦\x1b[0m  \x1b[1;35m║\x1b[0m`);
console.log(`\x1b[1;35m╚════════════════════════════════════════════════════════════════════════╝\x1b[0m\n`);

lines.forEach((line, index) => {
  try {
    const entry = JSON.parse(line);
    const shortTime = entry.timestamp.split('T')[1].split('.')[0];
    const endpoint = entry.url.replace('/exa.language_server_pb.LanguageServerService/', '');
    
    let summary = '';
    if (entry.requestPayload) {
      if (entry.requestPayload.cascade_id) summary += `cascade: ${entry.requestPayload.cascade_id.slice(0, 8)}... `;
      if (entry.requestPayload.requested_model) summary += `model: ${entry.requestPayload.requested_model} `;
      if (entry.requestPayload.items?.[0]?.text) {
        const text = entry.requestPayload.items[0].text.replace(/\n/g, ' ');
        summary += `prompt: "${text.length > 50 ? text.slice(0, 50) + '...' : text}" `;
      }
      if (entry.requestPayload.cascade_config?.chat_model_name) {
        summary += `modelName: ${entry.requestPayload.cascade_config.chat_model_name} `;
      }
    }

    const frameCount = entry.responseFrames ? `${entry.responseFrames.length} frames` : '1 res';

    console.log(`\x1b[1;33m[#${(index + 1).toString().padStart(3, ' ')}]\x1b[0m \x1b[90m${shortTime}\x1b[0m \x1b[1;36m${endpoint.padEnd(30)}\x1b[0m \x1b[32m${frameCount.padEnd(10)}\x1b[0m \x1b[37m${summary}\x1b[0m`);
  } catch (e) {
    console.error(`Line ${index + 1} parse error:`, e.message);
  }
});

console.log(`\n\x1b[90mTip: To inspect a specific request in full JSON detail, run:\x1b[0m`);
console.log(`\x1b[1;32mnode analyze_traffic.js <number>\x1b[0m e.g. \x1b[36mnode analyze_traffic.js 1\x1b[0m\n`);

const reqIndexStr = process.argv[2];
if (reqIndexStr && !isNaN(parseInt(reqIndexStr))) {
  const targetIdx = parseInt(reqIndexStr, 10) - 1;
  if (targetIdx >= 0 && targetIdx < lines.length) {
    const target = JSON.parse(lines[targetIdx]);
    console.log(`\x1b[1;35m=== DETAILED TRAFFIC TRACE FOR REQUEST #${targetIdx + 1} ===\x1b[0m`);
    console.log(`Timestamp: ${target.timestamp}`);
    console.log(`Endpoint:  ${target.url}`);
    console.log(`Method:    ${target.method}`);
    console.log(`\n\x1b[1;33m--- REQUEST PAYLOAD ---\x1b[0m`);
    console.dir(target.requestPayload, { depth: null, colors: true });
    
    console.log(`\n\x1b[1;32m--- RESPONSE FRAMES (${target.responseFrames?.length || 0}) ---\x1b[0m`);
    if (target.responseFrames) {
      target.responseFrames.forEach((frame, idx) => {
        console.log(`\x1b[36m[Frame #${idx + 1} - ${frame.flag}]\x1b[0m`);
        console.dir(frame.payload, { depth: null, colors: true });
      });
    } else {
      console.log(target.responseRaw);
    }
  }
}
