#!/usr/bin/env node
// 语音剪贴板同步 — 局域网版
// 手机浏览器打开 http://电脑IP:9898 → 输入文字 → 点发送 → 电脑剪贴板自动有

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { networkInterfaces, platform, tmpdir } from 'os';
import { join } from 'path';
import qrcode from 'qrcode-terminal';

const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

function copyToClipboard(text) {
  if (IS_WIN) {
    const tmp = join(tmpdir(), `_cb_sync_${process.pid}.txt`);
    writeFileSync(tmp, text, 'utf8');
    try {
      execSync(`powershell -NoProfile -Command "Set-Clipboard (Get-Content -Raw -Encoding UTF8 '${tmp}')"`);
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  } else if (IS_MAC) {
    execSync('pbcopy', { input: text });
  } else {
    // Linux: try xclip, then xsel
    try {
      execSync('xclip -selection clipboard', { input: text });
    } catch {
      execSync('xsel --clipboard --input', { input: text });
    }
  }
}

// 解析命令行参数: node clipboard-sync.mjs [port] [--ip x.x.x.x]
let PORT = 9898;
let PREFERRED_IP = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--ip' && process.argv[i + 1]) {
    PREFERRED_IP = process.argv[++i];
  } else if (/^\d+$/.test(process.argv[i])) {
    PORT = parseInt(process.argv[i]);
  }
}

function getAllIPs() {
  const nets = networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  // 排序: 真实网卡优先，虚拟网卡靠后; 同类中 192.168 > 10 > 172 > 其他
  const VIRTUAL_RE = /virtual|vmware|vmnet|vbox|virtualbox|hyper-v|vethernet|docker|wsl|tailscale|zerotier|hamachi/i;
  results.sort((a, b) => {
    const isVirtual = (name, ip) => {
      if (VIRTUAL_RE.test(name)) return 1;
      // VirtualBox Host-Only 默认网段
      if (ip.startsWith('192.168.56.')) return 1;
      return 0;
    };
    const ipScore = (ip) => {
      if (ip.startsWith('192.168.')) return 0;
      if (ip.startsWith('10.')) return 1;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
      return 3;
    };
    // 先按虚拟网卡排后，再按 IP 段排序
    return (isVirtual(a.name, a.address) - isVirtual(b.name, b.address)) || (ipScore(a.address) - ipScore(b.address));
  });
  return results;
}

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>剪贴板同步</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,sans-serif; background:#1a1a2e; color:#eee;
         display:flex; flex-direction:column; height:50dvh; padding:8px 16px env(safe-area-inset-bottom); }
  h1 { font-size:15px; text-align:center; margin-bottom:6px; color:#8be9fd; }
  #status { text-align:center; font-size:12px; margin-bottom:8px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .on { background:#50fa7b; }
  .off { background:#ff5555; }
  textarea { width:100%; flex:1; min-height:0; background:#16213e; border:1px solid #333;
             border-radius:12px; padding:14px; font-size:16px; color:#eee;
             resize:none; outline:none; line-height:1.6; }
  textarea:focus { border-color:#8be9fd; }
  .actions { display:flex; gap:10px; margin-top:8px; flex-shrink:0; }
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
  <button id="clearBtn" onclick="input.value='';input.focus()">清空</button>
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
      copyToClipboard(text);
      console.log(`[同步] ${text.length}字 → 剪贴板 | ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`);
      ws.send(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('[错误]', e.message);
    }
  });
  ws.on('close', () => console.log('[断开] 设备已断开'));
});

server.listen(PORT, '0.0.0.0', () => {
  const allIPs = getAllIPs();
  const pasteHint = IS_MAC ? 'Cmd+V' : 'Ctrl+V';

  // 确定主 IP: --ip 指定 > 自动排序第一个 > localhost
  let primaryIP = 'localhost';
  if (PREFERRED_IP) {
    primaryIP = PREFERRED_IP;
  } else if (allIPs.length > 0) {
    primaryIP = allIPs[0].address;
  }
  const primaryUrl = `http://${primaryIP}:${PORT}`;

  console.log(`\n📋 剪贴板同步已启动`);
  console.log(`   然后语音输入 → 点发送 → 电脑直接 ${pasteHint}\n`);

  if (allIPs.length > 0) {
    console.log('   可用地址:');
    for (const { name, address } of allIPs) {
      const tag = address === primaryIP ? ' ← 二维码' : '';
      console.log(`   ${address === primaryIP ? '→' : ' '} http://${address}:${PORT}  (${name})${tag}`);
    }
    console.log('');
    if (!PREFERRED_IP && allIPs.length > 1) {
      console.log(`   如果地址不对，用 --ip 指定: node clipboard-sync.mjs --ip ${allIPs.length > 1 ? allIPs[1].address : 'x.x.x.x'}\n`);
    }
  } else {
    console.log(`   手机浏览器打开: ${primaryUrl}\n`);
  }

  qrcode.generate(primaryUrl, { small: true }, (code) => {
    console.log(code);
  });
});
