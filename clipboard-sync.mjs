#!/usr/bin/env node
// 语音剪贴板同步 — 局域网版
// 手机浏览器打开 http://电脑IP:9898 → 输入文字 → 点发送 → Mac 剪贴板自动有

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { execSync } from 'child_process';
import { networkInterfaces } from 'os';

const PORT = 9898;

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>剪贴板同步</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,sans-serif; background:#1a1a2e; color:#eee;
         display:flex; flex-direction:column; height:100dvh; padding:16px; }
  h1 { font-size:18px; text-align:center; margin-bottom:12px; color:#8be9fd; }
  #status { text-align:center; font-size:13px; margin-bottom:12px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .on { background:#50fa7b; }
  .off { background:#ff5555; }
  textarea { width:100%; height:80px; background:#16213e; border:1px solid #333;
             border-radius:12px; padding:14px; font-size:16px; color:#eee;
             resize:none; outline:none; line-height:1.6; }
  textarea:focus { border-color:#8be9fd; }
  .actions { display:flex; gap:10px; margin-top:12px; }
  button { flex:1; padding:14px; border:none; border-radius:12px; font-size:16px;
           font-weight:600; cursor:pointer; transition:all .15s; }
  #sendBtn { background:#8be9fd; color:#1a1a2e; }
  #sendBtn:active { transform:scale(0.97); background:#6bc5d8; }
  #clearBtn { background:#333; color:#aaa; flex:0.4; }
  .toast { position:fixed; top:40%; left:50%; transform:translate(-50%,-50%);
           background:rgba(80,250,123,0.95); color:#1a1a2e; padding:12px 28px;
           border-radius:10px; font-size:15px; font-weight:600;
           opacity:0; transition:opacity .3s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<h1>剪贴板同步</h1>
<div id="status"><span class="dot off" id="dot"></span><span id="stxt">连接中...</span></div>
<textarea id="input" placeholder="在这里用语音输入或打字，点发送同步到电脑剪贴板" autofocus></textarea>
<div class="actions">
  <button id="clearBtn" onclick="input.value=''">清空</button>
  <button id="sendBtn" onclick="send()">发送到电脑</button>
</div>
<div class="toast" id="toast"></div>
<script>
  const input = document.getElementById('input');
  const dot = document.getElementById('dot');
  const stxt = document.getElementById('stxt');
  const toast = document.getElementById('toast');
  let ws, reconTimer;

  function connect() {
    ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onopen = () => { dot.className='dot on'; stxt.textContent='已连接'; };
    ws.onclose = () => { dot.className='dot off'; stxt.textContent='已断开，重连中...'; reconTimer = setTimeout(connect, 1500); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.ok) showToast('已同步到剪贴板');
    };
  }
  connect();

  function send() {
    const text = input.value.trim();
    if (!text) return;
    if (ws.readyState !== 1) { showToast('未连接'); return; }
    ws.send(JSON.stringify({ text }));
    input.select();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[连接] 新设备已连接');
  ws.on('message', (raw) => {
    try {
      const { text } = JSON.parse(raw);
      if (!text) return;
      execSync('pbcopy', { input: text });
      console.log(`[同步] ${text.length}字 → 剪贴板 | ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`);
      ws.send(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('[错误]', e.message);
    }
  });
  ws.on('close', () => console.log('[断开] 设备已断开'));
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n📋 剪贴板同步已启动`);
  console.log(`   手机浏览器打开: http://${ip}:${PORT}`);
  console.log(`   然后语音输入 → 点发送 → Mac 直接 Cmd+V\n`);
});
