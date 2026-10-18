/*
 * 浏览器端到端冒烟测试 + 截图
 * ------------------------------------------------------------------
 * 使用 Edge headless + Chrome DevTools Protocol（Node 内置 WebSocket）。
 *
 * 运行：
 *   node web/tests/browser-smoke.mjs
 *
 * 会生成截图到 web/screenshots/ 目录。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const C = require('../js/core.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const projectRoot = path.resolve(webRoot, '..');
const screenshotDir = path.join(webRoot, 'screenshots');
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-download-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-edge-profile-'));
const HTTP_PORT = Number(process.env.SMS_TEST_HTTP_PORT || 8137);
const DEBUG_PORT = Number(process.env.SMS_TEST_DEBUG_PORT || 9333);

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const edgePath = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!edgePath) {
  throw new Error('未找到 Microsoft Edge，可通过 EDGE_PATH 环境变量指定路径');
}

/* ------------------------------------------------------------------ *
 * 静态服务器
 * ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.join(webRoot, relativePath);
  if (!filePath.startsWith(webRoot)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(HTTP_PORT, '127.0.0.1', resolve);
});

/* ------------------------------------------------------------------ *
 * 启动 Edge 并连接 CDP
 * ------------------------------------------------------------------ */
const edge = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--window-size=1440,1000',
  '--remote-debugging-port=' + DEBUG_PORT,
  '--user-data-dir=' + profileDir,
  'about:blank'
], { stdio: 'ignore' });

async function waitForEndpoint() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/version');
      if (response.ok) return;
    } catch (error) {
      /* 等待浏览器启动 */
    }
    await sleep(200);
  }
  throw new Error('等待 Edge 调试端口超时');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        const handlers = this.handlers.get(message.method) || [];
        handlers.forEach((handler) => handler(message.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error('页面脚本异常：' + (description || result.exceptionDetails.text));
  }
  return result.result ? result.result.value : undefined;
}

async function waitFor(cdp, expression, timeout = 6000, label = expression) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error('等待条件超时：' + label + (lastError ? '（' + lastError.message + '）' : ''));
}

const consoleErrors = [];
const checks = [];

function check(name, condition, details = '') {
  if (!condition) {
    throw new Error('检查失败：' + name + (details ? ' — ' + details : ''));
  }
  checks.push(name);
  console.log('  ✓ ' + name);
}

async function screenshot(cdp, name) {
  await dismissToasts(cdp);
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = path.join(screenshotDir, name + '.png');
  fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
  console.log('  · 截图 ' + path.relative(projectRoot, target));
}

async function dismissToasts(cdp) {
  await evaluate(cdp, `document.querySelectorAll('.toast-close').forEach(function (button) { button.click(); }); true`);
  await sleep(350);
}

async function gotoView(cdp, view) {
  await evaluate(cdp, `document.querySelector('.nav-item[data-view="${view}"]').click(); true`);
  await waitFor(cdp, `document.getElementById('view-${view}').classList.contains('is-active')`, 5000, '切换到 ' + view);
}

let cdp = null;

try {
  await waitForEndpoint();
  const targets = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json();
  const pageTarget = targets.find((target) => target.type === 'page');
  if (!pageTarget) throw new Error('未找到页面调试目标');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(ws);

  cdp.on('Runtime.exceptionThrown', (params) => {
    const details = params.exceptionDetails;
    consoleErrors.push('未捕获异常：' + (details.exception && details.exception.description
      ? details.exception.description
      : details.text));
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type !== 'error') return;
    const text = params.args.map((argument) => argument.value !== undefined ? argument.value : argument.description).join(' ');
    consoleErrors.push('console.error：' + text);
  });
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry.level === 'error') consoleErrors.push('日志错误：' + params.entry.text);
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });

  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/index.html' });
  await waitFor(cdp, `document.getElementById('dash-stats') && document.getElementById('dash-stats').children.length === 4`, 10000, '页面初始化');

  fs.mkdirSync(screenshotDir, { recursive: true });

  /* ---------------- 首次使用引导 ---------------- */
  console.log('\n[0] 首次使用引导');
  await waitFor(cdp, `document.querySelector('.modal--welcome') !== null`, 6000, '首次引导弹窗');
  check('首次访问自动打开引导弹窗', true);
  check('引导包含 4 个步骤', await evaluate(cdp, `document.querySelectorAll('.welcome-dot').length === 4`));
  check('第 1 步标题正确', await evaluate(cdp, `document.querySelector('.welcome-slide.is-active h3').textContent === '欢迎使用学籍云'`));
  check('引导打开时背景不可交互', await evaluate(cdp, `document.querySelector('.app').hasAttribute('inert')`));
  await screenshot(cdp, '00-welcome');
  await evaluate(cdp, `document.querySelector('[data-role="next"]').click(); true`);
  await waitFor(cdp, `document.querySelector('.welcome-slide.is-active').getAttribute('data-step') === '1'`, 2000, '引导第二步');
  check('可以切换到第 2 步', true);
  await screenshot(cdp, '00-welcome-2');
  await evaluate(cdp, `document.querySelector('[data-role="next"]').click(); true`);
  await screenshot(cdp, '00-welcome-3');
  await evaluate(cdp, `document.querySelector('[data-role="next"]').click(); true`);
  await waitFor(cdp, `document.querySelector('.welcome-slide.is-active').getAttribute('data-step') === '3'`, 2000, '引导最后一步');
  check('最后一步显示进入系统的选项', await evaluate(cdp, `document.querySelectorAll('[data-welcome-action]').length === 3`));
  check('最后一步按钮文案为进入系统', await evaluate(cdp, `document.querySelector('[data-role="next"]').textContent === '进入系统'`));
  await screenshot(cdp, '00-welcome-start');
  await evaluate(cdp, `document.querySelector('[data-welcome-action="demo"]').click(); true`);
  await waitFor(cdp, `!document.querySelector('.modal--welcome')`, 3000, '完成引导');
  check('完成后记录已引导状态', await evaluate(cdp, `localStorage.getItem('sms.onboarded.v1') === '1'`));
  check('关闭后背景恢复可交互', await evaluate(cdp, `!document.querySelector('.app').hasAttribute('inert')`));

  /* ---------------- 侧边栏拖动伸缩 ---------------- */
  console.log('\n[0.5] 侧边栏拖动伸缩');
  check('默认侧边栏宽度为 254px', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 254`));
  const resizerPoint = await evaluate(cdp, `(function () {
    var rect = document.getElementById('sidebar-resizer').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: Math.min(window.innerHeight / 2, rect.y + rect.height / 2) };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: resizerPoint.x, y: resizerPoint.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizerPoint.x + 80, y: resizerPoint.y, button: 'left', buttons: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizerPoint.x + 80, y: resizerPoint.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(150);
  check('鼠标拖动可以加宽侧边栏', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 334`),
    String(await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width)`)));
  check('侧边栏宽度已持久化', await evaluate(cdp, `localStorage.getItem('sms.sidebar.width.v1') === '334'`));
  await screenshot(cdp, '12-sidebar-resized');
  await cdp.send('Page.reload');
  await waitFor(cdp, `document.getElementById('dash-stats') && document.getElementById('dash-stats').children.length === 4`, 10000, '刷新页面');
  await sleep(200);
  check('刷新后侧边栏宽度保持', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 334`));
  await evaluate(cdp, `document.getElementById('sidebar-resizer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); true`);
  await sleep(100);
  check('双击恢复默认宽度', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 254`));
  await evaluate(cdp, `(function () {
    var resizer = document.getElementById('sidebar-resizer');
    resizer.focus();
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    return true;
  })()`);
  await sleep(100);
  check('键盘方向键可以微调宽度', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 246`));
  await evaluate(cdp, `(function () {
    var resizer = document.getElementById('sidebar-resizer');
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    return true;
  })()`);
  await sleep(100);
  check('Home 键恢复默认宽度', await evaluate(cdp, `Math.round(document.getElementById('sidebar').getBoundingClientRect().width) === 254`));

  /* ---------------- 初始状态 ---------------- */
  console.log('\n[1] 初始加载与数据看板');
  check('页面标题正确', (await evaluate(cdp, 'document.title')).includes('学籍云'));
  check('示例数据自动载入 12 名学生', await evaluate(cdp, `document.getElementById('nav-count').textContent === '12'`));
  check('数据看板展示 4 张统计卡片', await evaluate(cdp, `document.querySelectorAll('#dash-stats .stat-card').length === 4`));
  check('成绩分布图有 5 个分数段', await evaluate(cdp, `document.querySelectorAll('#dash-distribution .bar-col').length === 5`));
  check('优秀学生榜首为周婷', await evaluate(cdp, `document.querySelector('#dash-top .rank-item .rank-info strong').textContent === '周婷'`));
  check('学生表格分页显示 9 条', await evaluate(cdp, `document.querySelectorAll('#student-table-body tr').length === 9`));
  check('侧边栏显示示例数据状态', await evaluate(cdp, `document.getElementById('storage-label').textContent === '示例数据'`));
  check('当前导航项带有 aria-current', await evaluate(cdp, `document.querySelector('.nav-item[data-view="dashboard"]').getAttribute('aria-current') === 'page'`));
  check('浅色主题声明 color-scheme', await evaluate(cdp, `getComputedStyle(document.documentElement).colorScheme === 'light'`));
  await dismissToasts(cdp);
  await screenshot(cdp, '01-dashboard-light');

  /* ---------------- 学生管理 ---------------- */
  console.log('\n[2] 学生管理：搜索 / 排序 / 分页');
  await gotoView(cdp, 'students');
  check('学生视图激活', await evaluate(cdp, `document.getElementById('view-students').classList.contains('is-active')`));
  await screenshot(cdp, '02-students');

  await evaluate(cdp, `
    var input = document.getElementById('student-search');
    input.value = '周';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    true;
  `);
  await waitFor(cdp, `document.querySelectorAll('#student-table-body tr').length === 1`, 3000, '搜索结果');
  check('按姓名搜索得到 1 条记录', await evaluate(cdp, `document.querySelector('#student-table-body .student-name').textContent === '周婷'`));

  await evaluate(cdp, `
    var input = document.getElementById('student-search');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    true;
  `);
  await waitFor(cdp, `document.querySelectorAll('#student-table-body tr').length === 9`, 3000, '清空搜索');

  await evaluate(cdp, `document.querySelector('#student-table th[data-sort="total"] .th-btn').click(); true`);
  await waitFor(cdp, `document.querySelector('#student-table th[data-sort="total"]').classList.contains('is-sorted')`, 3000, '总分排序');
  check('按总分降序后榜首为周婷', await evaluate(cdp, `document.querySelector('#student-table-body .student-name').textContent === '周婷'`));

  await evaluate(cdp, `document.querySelectorAll('#student-pagination .page-btn[data-page="2"]')[0].click(); true`);
  await waitFor(cdp, `document.getElementById('student-pagination').textContent.includes('10–12')`, 3000, '翻到第二页');
  check('第二页显示 3 条记录', await evaluate(cdp, `document.querySelectorAll('#student-table-body tr').length === 3`));
  await evaluate(cdp, `document.querySelector('#student-pagination .page-btn[data-page="1"]').click(); true`);

  /* ---------------- 添加 / 编辑 / 删除 / 撤销 ---------------- */
  console.log('\n[3] 添加、删除与撤销');
  await evaluate(cdp, `document.querySelector('.topbar .js-add-student').click(); true`);
  await waitFor(cdp, `document.getElementById('student-form') !== null`, 3000, '打开添加表单');
  await waitFor(cdp, `document.activeElement && document.activeElement.id === 'f-number'`, 3000, '添加表单自动聚焦');
  check('添加表单默认聚焦学号', true);
  await screenshot(cdp, '03-add-form');

  await evaluate(cdp, `document.querySelector('button[form="student-form"]').click(); true`);
  await sleep(150);
  check('空表单提交时显示必填错误', await evaluate(cdp, `document.querySelector('.field[data-field="number"]').classList.contains('has-error')`));

  await evaluate(cdp, `
    function setValue(selector, value) {
      var element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setValue('#f-chinese', '1.04');
    setValue('#f-math', '1.04');
    setValue('#f-english', '1.04');
    true;
  `);
  check('表单预览按一位小数计算总分', await evaluate(cdp, `document.getElementById('preview-total').textContent === '3.0'`));

  await evaluate(cdp, `
    function setValue(selector, value) {
      var element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setValue('#f-number', '20249999');
    setValue('#f-name', '测试生');
    setValue('#f-chinese', '88.5');
    setValue('#f-math', '76');
    setValue('#f-english', '90');
    true;
  `);
  check('表单实时计算总分', await evaluate(cdp, `document.getElementById('preview-total').textContent === '254.5'`));
  await evaluate(cdp, `document.querySelector('button[form="student-form"]').click(); true`);
  await waitFor(cdp, `document.getElementById('student-form') === null`, 4000, '提交表单');
  check('添加后学生数变为 13', await evaluate(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.length === 13`));

  await evaluate(cdp, `
    var input = document.getElementById('student-search');
    input.value = '20249999';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    true;
  `);
  await waitFor(cdp, `document.querySelectorAll('#student-table-body tr').length === 1`, 3000, '搜索新学生');
  check('新学生出现在表格中', await evaluate(cdp, `document.querySelector('#student-table-body .student-name').textContent === '测试生'`));

  await evaluate(cdp, `
    var deleteButton = document.querySelector('#student-table-body .js-delete');
    deleteButton.focus();
    deleteButton.click();
    true;
  `);
  await waitFor(cdp, `document.querySelector('.modal-backdrop') !== null`, 3000, '删除确认弹窗');
  await waitFor(cdp, `document.activeElement === document.querySelector('.modal-backdrop .modal-foot [data-role="cancel"]')`, 3000, '删除弹窗聚焦取消');
  check('删除确认弹窗打开后聚焦取消按钮', true);
  await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await waitFor(cdp, `!document.querySelector('.modal-backdrop')`, 3000, 'Esc 关闭删除确认');
  check('Esc 关闭后焦点回到触发按钮', await evaluate(cdp,
    `document.activeElement && document.activeElement.classList.contains('js-delete')`));

  await evaluate(cdp, `
    var deleteButton = document.querySelector('#student-table-body .js-delete');
    deleteButton.focus();
    deleteButton.click();
    true;
  `);
  await waitFor(cdp, `document.querySelector('.modal-backdrop') !== null`, 3000, '再次打开删除确认');
  await evaluate(cdp, `document.querySelector('.modal-foot [data-role="confirm"]').click(); true`);
  await waitFor(cdp, `!document.querySelector('.modal-backdrop')`, 3000, '关闭删除确认');
  check('删除后学生数回到 12', await evaluate(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.length === 12`));
  await waitFor(cdp, `document.querySelector('.toast-action') !== null`, 3000, '撤销提示');
  await evaluate(cdp, `document.querySelector('.toast-action').click(); true`);
  await waitFor(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.length === 13`, 3000, '撤销删除');
  check('撤销删除恢复 13 条记录', true);

  /* ---------------- 导入 student.txt ---------------- */
  console.log('\n[4] 导入 C 后端 student.txt');
  await gotoView(cdp, 'data');
  const cFileBuffer = fs.readFileSync(path.join(projectRoot, 'data', 'student.txt'));
  const cFileDecoded = C.decodeBinary(cFileBuffer);
  const cFileCount = cFileDecoded.students.length;
  const cFileNumbers = cFileDecoded.students.map((student) => student.number).join(',');
  const cFileNames = cFileDecoded.students.map((student) => student.name).join(',');
  const binaryBase64 = cFileBuffer.toString('base64');
  await evaluate(cdp, `
    (async function () {
      var bytes = Uint8Array.from(atob('${binaryBase64}'), function (character) { return character.charCodeAt(0); });
      var file = new File([bytes], 'student.txt', { type: 'application/octet-stream' });
      var transfer = new DataTransfer();
      transfer.items.add(file);
      var input = document.getElementById('file-binary');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `, true);
  await waitFor(cdp, `document.querySelector('.modal-backdrop') !== null`, 4000, '打开导入弹窗');
  check('导入弹窗识别正确记录数', await evaluate(cdp,
    `document.querySelector('.import-file div span').textContent.includes('${cFileCount} 条有效记录')`));
  await screenshot(cdp, '09-import-dialog');
  await evaluate(cdp, `document.querySelector('.modal-foot [data-role="confirm"]').click(); true`);
  await waitFor(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.length === ${cFileCount}`, 4000, '应用导入');
  const importedNumbers = await evaluate(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.map(function (student) { return student.number; }).join(',')`);
  check('导入后记录与源文件一致', importedNumbers === cFileNumbers, importedNumbers);
  check('导入后侧边栏计数正确', await evaluate(cdp, `document.getElementById('nav-count').textContent === '${cFileCount}'`));

  /* ---------------- 导出 student.txt ---------------- */
  console.log('\n[5] 导出 student.txt 并校验二进制');
  try {
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true
    });
  } catch (error) {
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  }
  await dismissToasts(cdp);
  await evaluate(cdp, `document.getElementById('btn-export-binary').click(); true`);
  const exportedPath = path.join(downloadDir, 'student.txt');
  const downloadDeadline = Date.now() + 6000;
  while (Date.now() < downloadDeadline && !fs.existsSync(exportedPath)) {
    await sleep(150);
  }
  check('导出的 student.txt 存在', fs.existsSync(exportedPath));
  const exportedBytes = fs.readFileSync(exportedPath);
  check('导出文件大小与记录数一致', exportedBytes.length === cFileCount * C.RECORD_SIZE);
  const decodedExport = C.decodeBinary(exportedBytes);
  check('导出文件可被解析且记录正确', decodedExport.students.length === cFileCount &&
    decodedExport.students.map((student) => student.name).join(',') === cFileNames);

  /* ---------------- 恢复示例数据 ---------------- */
  console.log('\n[6] 载入示例数据、主题与截图');
  await evaluate(cdp, `document.getElementById('btn-load-demo').click(); true`);
  await waitFor(cdp, `document.querySelector('.modal-backdrop') !== null`, 3000, '示例数据确认');
  await evaluate(cdp, `document.querySelector('.modal-foot [data-role="confirm"]').click(); true`);
  await waitFor(cdp, `JSON.parse(localStorage.getItem('sms.students.v1')).students.length === 12`, 4000, '恢复示例数据');
  check('已恢复 12 条示例数据', true);

  await gotoView(cdp, 'analytics');
  await screenshot(cdp, '04-analytics');
  await gotoView(cdp, 'data');
  await screenshot(cdp, '05-data');

  console.log('\n[6.5] 使用说明页面');
  await gotoView(cdp, 'guide');
  check('使用说明页面激活', await evaluate(cdp, `document.getElementById('view-guide').classList.contains('is-active')`));
  check('使用说明包含 3 个步骤卡片', await evaluate(cdp, `document.querySelectorAll('#view-guide .guide-step').length === 3`));
  check('使用说明数据摘要正确', await evaluate(cdp, `document.getElementById('guide-data-summary').textContent.includes('12 名学生')`));
  await screenshot(cdp, '10-guide');
  await evaluate(cdp, `document.querySelector('[data-open-welcome]').click(); true`);
  await waitFor(cdp, `document.querySelector('.modal--welcome') !== null`, 3000, '重新打开引导');
  check('可以从使用说明重新打开引导', true);
  await evaluate(cdp, `document.querySelector('[data-role="skip"]').click(); true`);
  await waitFor(cdp, `!document.querySelector('.modal--welcome')`, 3000, '关闭重新打开的引导');

  await gotoView(cdp, 'dashboard');
  await evaluate(cdp, `document.getElementById('theme-toggle').click(); true`);
  await waitFor(cdp, `document.documentElement.getAttribute('data-theme') === 'dark'`, 2000, '切换深色主题');
  await sleep(800);
  const statColor = await evaluate(cdp, `getComputedStyle(document.querySelector('.stat-value')).color`);
  check('深色模式下统计数字使用浅色文字', statColor !== 'rgb(15, 23, 42)', statColor);
  check('深色主题切换成功', true);
  await screenshot(cdp, '06-dashboard-dark');
  await evaluate(cdp, `document.getElementById('theme-toggle').click(); true`);
  await waitFor(cdp, `document.documentElement.getAttribute('data-theme') === 'light'`, 2000, '切回浅色主题');
  await sleep(400);

  /* ---------------- 移动端截图 ---------------- */
  console.log('\n[7] 移动端响应式');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(350);
  await gotoView(cdp, 'dashboard');
  await screenshot(cdp, '07-mobile-dashboard');
  await gotoView(cdp, 'students');
  check('移动端学生表切换为卡片布局', await evaluate(cdp,
    `getComputedStyle(document.querySelector('#student-table thead')).display === 'none' && getComputedStyle(document.querySelector('#student-table-body tr')).display === 'grid'`));
  check('移动端隐藏侧边栏拖拽手柄', await evaluate(cdp,
    `getComputedStyle(document.getElementById('sidebar-resizer')).display === 'none'`));
  check('移动端显示排序控件', await evaluate(cdp,
    `getComputedStyle(document.getElementById('student-sort').closest('.sort-wrap')).display !== 'none'`));
  await evaluate(cdp, `
    var select = document.getElementById('student-sort');
    select.value = 'number:asc';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    true;
  `);
  check('移动端排序生效', await evaluate(cdp, `document.querySelector('#student-table-body .student-name').textContent === '张伟'`));
  check('移动端收起的侧边栏被移出焦点顺序', await evaluate(cdp, `document.getElementById('sidebar').hasAttribute('inert')`));
  await screenshot(cdp, '08-mobile-students');
  check('移动端侧边栏默认收起', await evaluate(cdp, `!document.getElementById('sidebar').classList.contains('is-open')`));
  await evaluate(cdp, `document.getElementById('menu-toggle').click(); true`);
  await sleep(300);
  check('移动端菜单可以展开', await evaluate(cdp, `document.getElementById('sidebar').classList.contains('is-open')`));
  check('移动端展开侧边栏后恢复可聚焦', await evaluate(cdp, `!document.getElementById('sidebar').hasAttribute('inert')`));
  await evaluate(cdp, `document.getElementById('sidebar-scrim').click(); true`);
  check('移动端关闭侧边栏后再次移出焦点顺序', await evaluate(cdp, `document.getElementById('sidebar').hasAttribute('inert')`));

  await gotoView(cdp, 'guide');
  check('移动端使用说明为单列布局', await evaluate(cdp,
    `getComputedStyle(document.querySelector('.guide-steps-grid')).gridTemplateColumns.split(' ').length === 1`));
  await screenshot(cdp, '11-mobile-guide');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });

  /* ---------------- file:// 直接打开 ---------------- */
  console.log('\n[8] file:// 直接打开检查');
  const fileUrl = 'file:///' + path.join(webRoot, 'index.html').replace(/\\/g, '/');
  await cdp.send('Page.navigate', { url: fileUrl });
  await waitFor(cdp, `document.getElementById('dash-stats') && document.getElementById('dash-stats').children.length === 4`, 10000, 'file:// 页面初始化');
  await sleep(700);
  if (await evaluate(cdp, `!!document.querySelector('.modal--welcome')`)) {
    await evaluate(cdp, `document.querySelector('[data-role="skip"]').click(); true`);
    await waitFor(cdp, `!document.querySelector('.modal--welcome')`, 3000, '关闭 file:// 引导');
  }
  check('file:// 方式可正常加载界面', true);
  check('file:// 方式可渲染学生表格', await evaluate(cdp, `document.querySelectorAll('#student-table-body tr').length === 9`));
  check('file:// 下本地存储可用', await evaluate(cdp, `document.getElementById('storage-label').textContent !== '仅内存模式'`));

  check('运行期间没有 JavaScript 错误', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log('\n全部检查通过：' + checks.length + ' 项');
  console.log('截图目录：' + path.relative(projectRoot, screenshotDir));
} catch (error) {
  console.error('\n测试失败：' + error.message);
  if (consoleErrors.length) console.error('页面错误：\n' + consoleErrors.join('\n'));
  process.exitCode = 1;
} finally {
  if (cdp) {
    try {
      cdp.ws.close();
    } catch (error) {
      /* 忽略关闭异常 */
    }
  }
  edge.kill();
  server.close();
  await sleep(300);
  if (process.exitCode) {
    console.error('浏览器配置目录保留在：' + profileDir);
  } else {
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}
