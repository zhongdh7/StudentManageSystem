/*
 * 前端核心逻辑单元测试
 * 运行：node --test web/tests/core.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../js/core.js');

const projectDataFile = fileURLToPath(new URL('../../data/student.txt', import.meta.url));

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

test('validateStudent 接受合法数据并归一化学号', () => {
  const result = C.validateStudent({
    number: '00123', name: '张伟', chinese: '88', math: 92, english: 85.55
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.number, '123');
  assert.equal(result.value.name, '张伟');
  assert.equal(result.value.chinese, 88);
  assert.equal(result.value.english, 85.6);
});

test('validateStudent 拒绝空值和非法成绩', () => {
  const result = C.validateStudent({
    number: '', name: '', chinese: '', math: '101', english: -1
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.number);
  assert.ok(result.errors.name);
  assert.ok(result.errors.chinese);
  assert.ok(result.errors.math);
  assert.ok(result.errors.english);
});

test('validateStudent 处理 uint64 边界与重复学号', () => {
  const max = C.validateStudent({
    number: C.MAX_UINT64_STRING, name: '边界', chinese: 0, math: 0, english: 0
  });
  assert.equal(max.valid, true);
  assert.equal(max.value.number, C.MAX_UINT64_STRING);

  const over = C.validateStudent({
    number: '18446744073709551616', name: '越界', chinese: 0, math: 0, english: 0
  });
  assert.equal(over.valid, false);
  assert.ok(over.errors.number);

  const duplicate = C.validateStudent(
    { number: '123', name: '重复', chinese: 0, math: 0, english: 0 },
    { existingNumbers: new Set(['123']) }
  );
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.errors.number, '该学号已存在');

  const selfEdit = C.validateStudent(
    { number: '123', name: '重复', chinese: 0, math: 0, english: 0 },
    { existingNumbers: new Set(['123']), originalNumber: '123' }
  );
  assert.equal(selfEdit.valid, true);
});

test('姓名按 UTF-8 字节数限制为 63 字节', () => {
  const ok = C.validateStudent({
    number: '1', name: '张'.repeat(21), chinese: 60, math: 60, english: 60
  });
  assert.equal(ok.valid, true);

  const tooLong = C.validateStudent({
    number: '1', name: '张'.repeat(22), chinese: 60, math: 60, english: 60
  });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.name, /63|21/);
});

/* ------------------------------------------------------------------ *
 * 二进制编解码
 * ------------------------------------------------------------------ */

test('encodeBinary 输出 88 字节/条的固定布局', () => {
  const bytes = C.encodeBinary([
    { number: '20240101', name: '张伟', chinese: 88, math: 92.5, english: 85 }
  ]);
  assert.equal(bytes.length, C.RECORD_SIZE);
  assert.equal(bytes.length, 88);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getBigUint64(0, true), 20240101n);
  assert.equal(view.getFloat32(72, true), 88);
  assert.equal(view.getFloat32(76, true), 92.5);
  assert.equal(view.getFloat32(80, true), 85);
  // 学号字段后紧跟姓名，其后 '\0' 填充
  assert.deepEqual(Array.from(bytes.slice(8, 14)), Array.from(new TextEncoder().encode('张伟')));
  assert.deepEqual(Array.from(bytes.slice(14, 72)), new Array(58).fill(0));
  // 结构体末尾 4 字节对齐填充为 0
  assert.deepEqual(Array.from(bytes.slice(84, 88)), [0, 0, 0, 0]);
});

test('二进制编解码往返保持数据一致（含 uint64 上限）', () => {
  const students = [
    { number: '20240101', name: '张伟', chinese: 88, math: 92.5, english: 85 },
    { number: C.MAX_UINT64_STRING, name: 'Max', chinese: 0, math: 100, english: 59.5 }
  ];
  const decoded = C.decodeBinary(C.encodeBinary(students));
  assert.equal(decoded.errors.length, 0);
  assert.equal(decoded.students.length, 2);
  assert.equal(decoded.students[0].number, '20240101');
  assert.equal(decoded.students[1].number, C.MAX_UINT64_STRING);
  assert.equal(decoded.students[1].english, 59.5);
});

test('可以解析 C 程序实际生成的 data/student.txt（按文件内容动态校验）', () => {
  const buffer = readFileSync(projectDataFile);
  const expectedFormat = buffer.length % C.RECORD_SIZE === 0 ? 'new' : 'legacy';
  const recordSize = expectedFormat === 'new' ? C.RECORD_SIZE : C.LEGACY_RECORD_SIZE;
  assert.equal(buffer.length % recordSize, 0);
  const decoded = C.decodeBinary(buffer);
  assert.equal(decoded.errors.length, 0);
  assert.equal(decoded.format, expectedFormat);
  assert.equal(decoded.students.length, buffer.length / recordSize);
  assert.ok(decoded.students.length > 0);
  decoded.students.forEach((student) => {
    assert.match(student.number, /^\d+$/);
    assert.ok(student.name.length > 0);
    assert.ok(student.chinese >= 0 && student.chinese <= 100);
    assert.ok(student.math >= 0 && student.math <= 100);
    assert.ok(student.english >= 0 && student.english <= 100);
  });
  // 重新编码后再解析，记录数量与字段保持一致
  const redecoded = C.decodeBinary(C.encodeBinary(decoded.students));
  assert.equal(redecoded.errors.length, 0);
  assert.equal(redecoded.format, 'new');
  assert.deepEqual(
    redecoded.students.map((student) => [student.number, student.name, student.chinese, student.math, student.english]),
    decoded.students.map((student) => [student.number, student.name, student.chinese, student.math, student.english])
  );
});

test('decodeBinary 兼容旧版 56 字节记录', () => {
  const buffer = new ArrayBuffer(C.LEGACY_RECORD_SIZE);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setBigUint64(0, 123n, true);
  bytes.set(new TextEncoder().encode('旧版姓名'), 8);
  view.setFloat32(40, 88, true);
  view.setFloat32(44, 92, true);
  view.setFloat32(48, 85, true);

  const decoded = C.decodeBinary(new Uint8Array(buffer));
  assert.equal(decoded.format, 'legacy');
  assert.equal(decoded.errors.length, 0);
  assert.equal(decoded.students.length, 1);
  assert.equal(decoded.students[0].name, '旧版姓名');

  const migrated = C.decodeBinary(C.encodeBinary(decoded.students));
  assert.equal(migrated.format, 'new');
  assert.equal(migrated.students[0].name, '旧版姓名');
});

test('decodeBinary 对非法文件给出可读错误', () => {
  const badLength = C.decodeBinary(new Uint8Array(10));
  assert.equal(badLength.students.length, 0);
  assert.match(badLength.errors[0].reason, /格式|数据文件/);

  const empty = C.decodeBinary(new Uint8Array(0));
  assert.equal(empty.students.length, 0);
  assert.match(empty.errors[0].reason, /空/);
});

test('decodeBinary 跳过重复学号与非法记录', () => {
  const bytes = C.encodeBinary([
    { number: '1', name: '甲', chinese: 60, math: 60, english: 60 },
    { number: '1', name: '乙', chinese: 70, math: 70, english: 70 }
  ]);
  const decoded = C.decodeBinary(bytes);
  assert.equal(decoded.students.length, 1);
  assert.equal(decoded.errors.length, 1);
  assert.match(decoded.errors[0].reason, /重复/);
});

/* ------------------------------------------------------------------ *
 * 统计与筛选
 * ------------------------------------------------------------------ */

const sample = [
  { number: '1', name: '甲', chinese: 100, math: 100, english: 100 },
  { number: '2', name: '乙', chinese: 60, math: 60, english: 60 },
  { number: '3', name: '丙', chinese: 50, math: 70, english: 80 }
];

test('computeStats 计算平均分、及格率、分布与第一名', () => {
  const stats = C.computeStats(sample);
  assert.equal(stats.count, 3);
  assert.equal(C.formatScore(stats.avgTotal), '226.7');
  assert.equal(stats.passCount, 2);
  assert.equal(stats.failCount, 1);
  assert.equal(C.formatPercent(stats.passRate), '66.7%');
  assert.deepEqual(stats.distribution, [0, 2, 0, 0, 1]);
  assert.equal(stats.top.name, '甲');
  assert.equal(C.formatScore(stats.subjects.chinese.avg), '70.0');
  assert.equal(C.formatScore(stats.subjects.chinese.min), '50.0');
  assert.equal(C.formatScore(stats.subjects.chinese.max), '100.0');
  assert.equal(stats.subjects.english.passCount, 3);
  assert.equal(stats.subjects.chinese.passCount, 2);
});

test('空数据统计不抛错', () => {
  const stats = C.computeStats([]);
  assert.equal(stats.count, 0);
  assert.equal(stats.top, null);
  assert.deepEqual(stats.distribution, [0, 0, 0, 0, 0]);
  assert.equal(C.formatPercent(stats.passRate), '0%');
});

test('排序与筛选', () => {
  assert.deepEqual(C.rankStudents(sample).map((s) => s.name), ['甲', '丙', '乙']);
  assert.deepEqual(C.sortStudents(sample, 'number', -1).map((s) => s.number), ['3', '2', '1']);

  const chineseRank = C.sortStudents(sample, 'chinese', -1);
  assert.deepEqual(chineseRank.map((s) => s.name), ['甲', '乙', '丙']);

  const fail = C.filterStudents(sample, { filter: 'fail' });
  assert.deepEqual(fail.map((s) => s.name), ['丙']);

  const excellent = C.filterStudents(sample, { filter: 'excellent' });
  assert.equal(excellent.length, 1);
  assert.equal(excellent[0].name, '甲');

  const search = C.filterStudents(sample, { query: '乙' });
  assert.equal(search.length, 1);

  const numberSearch = C.filterStudents(sample, { query: '3' });
  assert.equal(numberSearch.length, 1);
  assert.equal(numberSearch[0].name, '丙');
});

test('subjectDistribution 统计各科分数段', () => {
  const distribution = C.subjectDistribution(sample);
  assert.equal(distribution.length, 3);
  assert.deepEqual(distribution[0].buckets, [1, 1, 0, 0, 1]);
  assert.deepEqual(distribution[1].buckets, [0, 1, 1, 0, 1]);
  assert.deepEqual(distribution[2].buckets, [0, 1, 0, 1, 1]);
});

/* ------------------------------------------------------------------ *
 * JSON / CSV
 * ------------------------------------------------------------------ */

test('JSON 导入导出往返并跳过重复学号', () => {
  const text = C.toJSONExport(sample);
  const parsed = C.parseJSONImport(text);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.students.length, 3);
  assert.equal(parsed.students[0].number, '1');

  const duplicated = C.parseJSONImport(JSON.stringify({ students: [sample[0], sample[0]] }));
  assert.equal(duplicated.students.length, 1);
  assert.equal(duplicated.errors.length, 1);

  const broken = C.parseJSONImport('{ not json');
  assert.equal(broken.students.length, 0);
  assert.match(broken.errors[0].reason, /JSON/);

  const arrayForm = C.parseJSONImport(JSON.stringify(sample));
  assert.equal(arrayForm.students.length, 3);
});

test('CSV 导出带 BOM 并正确转义', () => {
  const csv = C.toCSV([
    { number: '1', name: '张,三', chinese: 88, math: 92, english: 85 }
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"张,三"'));
  assert.ok(csv.includes('学号,姓名,语文,数学,英语,总分,平均分'));
});

/* ------------------------------------------------------------------ *
 * 本地存储
 * ------------------------------------------------------------------ */

test('StudentStore 持久化增删改查', () => {
  const storage = C.createMemoryStorage();
  const store = new C.StudentStore(storage);
  assert.equal(store.load(), false);

  store.replaceAll(C.demoStudents(), { demo: true, message: '载入示例数据' });
  assert.equal(store.students.length, 12);
  assert.equal(store.demo, true);
  assert.equal(store.load(), true);

  store.add({ number: '20240999', name: '测试', chinese: 90, math: 90, english: 90 });
  assert.equal(store.students.length, 13);

  store.update('20240999', { number: '20240999', name: '测试', chinese: 91, math: 92, english: 93 });
  const updated = store.students.find((s) => s.number === '20240999');
  assert.equal(updated.chinese, 91);

  const removed = store.remove('20240999');
  assert.equal(store.students.length, 12);
  store.restore(removed.student, removed.index);
  assert.equal(store.students.length, 13);

  const reloaded = new C.StudentStore(storage);
  assert.equal(reloaded.load(), true);
  assert.equal(reloaded.students.length, 13);
  assert.equal(reloaded.students.find((s) => s.number === '20240999').english, 93);
});

test('StudentStore 忽略损坏数据并限制操作记录数量', () => {
  const storage = C.createMemoryStorage();
  storage.setItem(C.STORAGE_KEYS.students, 'not-json');
  const store = new C.StudentStore(storage);
  assert.equal(store.load(), false);
  assert.equal(store.students.length, 0);
  assert.equal(store.corrupt, true);

  store.replaceAll([]);
  for (let i = 0; i < 40; i += 1) {
    store.log('add', '记录 ' + i);
  }
  assert.equal(store.activity.length, 30);
  assert.equal(store.activity[0].message, '记录 39');
});

test('空存储统计与格式化工具', () => {
  assert.equal(C.formatPercent(75), '75%');
  assert.equal(C.formatPercent(66.66), '66.7%');
  assert.equal(C.formatBytes(672), '672 B');
  assert.equal(C.formatBytes(2048), '2.0 KB');
  assert.equal(C.formatScore(78.34), '78.3');
});

test('restore 拒绝撤销到已被重新占用的学号', () => {
  const store = new C.StudentStore(C.createMemoryStorage());
  store.add({ number: '100', name: '甲', chinese: 60, math: 60, english: 60 });
  const removed = store.remove('100');
  store.add({ number: '100', name: '乙', chinese: 70, math: 70, english: 70 });
  assert.throws(
    () => store.restore(removed.student, removed.index),
    /已被重新添加/
  );
  assert.equal(store.students.length, 1);
  assert.equal(store.students[0].name, '乙');
});

test('JSON 导入兼容 UTF-8 BOM', () => {
  const text = '\uFEFF' + JSON.stringify({
    students: [{ number: '1', name: '甲', chinese: 60, math: 60, english: 60 }]
  });
  const parsed = C.parseJSONImport(text);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.students.length, 1);
  assert.equal(parsed.students[0].name, '甲');
});

test('CSV 导出阻止公式注入', () => {
  const csv = C.toCSV([
    { number: '1', name: '=1+1', chinese: 60, math: 60, english: 60 }
  ]);
  assert.ok(csv.includes("'=1+1"), csv);
  assert.ok(!csv.includes(',=1+1,'), csv);
});

test('二进制导入拒绝非法 UTF-8 姓名并提示', () => {
  const buffer = new ArrayBuffer(C.RECORD_SIZE);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setBigUint64(0, 1n, true);
  bytes[8] = 0xff;
  bytes[9] = 0xfe;
  view.setFloat32(72, 60, true);
  view.setFloat32(76, 60, true);
  view.setFloat32(80, 60, true);

  const decoded = C.decodeBinary(new Uint8Array(buffer));
  assert.equal(decoded.students.length, 0);
  assert.equal(decoded.errors.length, 1);
  assert.match(decoded.errors[0].reason, /姓名|格式/);
});

test('活动记录中的非法 time/type 会被清洗', () => {
  const storage = C.createMemoryStorage();
  storage.setItem(C.STORAGE_KEYS.activity, JSON.stringify([
    { type: '<img onerror=alert(1)>', message: '测试', time: '1" onmouseover="alert(1)' },
    { type: 'add', message: '正常', time: 1700000000000 }
  ]));
  const store = new C.StudentStore(storage);
  store.load();
  assert.equal(store.activity.length, 2);
  assert.equal(store.activity[0].type, 'history');
  assert.equal(typeof store.activity[0].time, 'number');
  assert.equal(store.activity[1].type, 'add');
});
