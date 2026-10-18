/*!
 * 高校学生成绩管理系统 · 前端核心逻辑
 * ------------------------------------------------------------------
 * 纯 JavaScript 实现，不依赖任何第三方库。
 * 浏览器中通过全局对象 StudentCore 使用，Node.js 中通过 require 使用。
 *
 * 数据文件格式：
 *   uint64_t number;    // 偏移 0， 8 字节，小端序
 *   char     name[64];  // 偏移 8， 64 字节，UTF-8 + '\0' 填充
 *   float    chinese;   // 偏移 72，4 字节，小端序
 *   float    math;      // 偏移 76，4 字节，小端序
 *   float    english;   // 偏移 80，4 字节，小端序
 *   // 4 字节对齐填充，记录总长 88 字节
 * 旧版 56 字节记录仍可读取，导出时统一转换为 88 字节格式。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StudentCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 常量
   * ------------------------------------------------------------------ */

  var RECORD_SIZE = 88;             // 8(学号) + 64(姓名) + 12(成绩) + 4(填充)
  var NAME_FIELD_SIZE = 64;
  var MAX_NAME_BYTES = NAME_FIELD_SIZE - 1; // 需要保留结尾 '\0'
  var NAME_OFFSET = 8;
  var SCORE_OFFSET = NAME_OFFSET + NAME_FIELD_SIZE; // 72
  var PADDING_SIZE = 4;

  // 旧版 56 字节记录，仅用于兼容读取历史数据文件
  var LEGACY_RECORD_SIZE = 56;
  var LEGACY_NAME_FIELD_SIZE = 32;
  var LEGACY_SCORE_OFFSET = 8 + LEGACY_NAME_FIELD_SIZE; // 40

  var MAX_UINT64 = 18446744073709551615n;

  var STORAGE_KEYS = {
    students: 'sms.students.v1',
    activity: 'sms.activity.v1',
    theme: 'sms.theme.v1',
    onboarded: 'sms.onboarded.v1',
    sidebarWidth: 'sms.sidebar.width.v1'
  };

  var ACTIVITY_TYPES = ['add', 'update', 'remove', 'restore', 'import', 'export', 'clear', 'demo'];

  var SUBJECTS = [
    { key: 'chinese', label: '语文', short: '语' },
    { key: 'math', label: '数学', short: '数' },
    { key: 'english', label: '英语', short: '英' }
  ];

  var SCORE_BUCKETS = [
    { label: '0–59', min: 0, max: 60 },
    { label: '60–69', min: 60, max: 70 },
    { label: '70–79', min: 70, max: 80 },
    { label: '80–89', min: 80, max: 90 },
    { label: '90–100', min: 90, max: 101 }
  ];

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function trimToString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function toNumberOrNaN(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
  }

  function utf8ByteLength(text) {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(String(text)).length;
    }
    // 极老环境的兜底（正常浏览器不会走到这里）
    return unescape(encodeURIComponent(String(text))).length;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function formatScore(value) {
    if (!Number.isFinite(value)) return '—';
    return round1(value).toFixed(1);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return '—';
    var rounded = round1(value);
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ------------------------------------------------------------------ *
   * 学号与校验
   * ------------------------------------------------------------------ */

  function normalizeNumber(raw) {
    var text = trimToString(raw);
    if (!/^\d+$/.test(text)) return null;
    try {
      var big = BigInt(text);
      if (big > MAX_UINT64) return null;
      return big.toString();
    } catch (error) {
      return null;
    }
  }

  function compareNumbers(left, right) {
    try {
      var a = BigInt(left);
      var b = BigInt(right);
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    } catch (error) {
      var sa = String(left);
      var sb = String(right);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
  }

  /**
   * 校验一位学生的数据。
   * @param {object} input 原始输入
   * @param {object} [options] { existingNumbers: Set<string>, originalNumber: string }
   * @returns {{ valid: boolean, errors: Object, value: object }}
   */
  function validateStudent(input, options) {
    var optionsSafe = options || {};
    var source = isObject(input) ? input : {};
    var errors = {};
    var value = {};

    var rawNumber = trimToString(source.number);
    var number = normalizeNumber(source.number);
    if (rawNumber === '') {
      errors.number = '请输入学号';
    } else if (!/^\d+$/.test(rawNumber)) {
      errors.number = '学号需为纯数字';
    } else if (number === null) {
      errors.number = '学号数值过大，请检查是否输入正确';
    } else {
      value.number = number;
      if (optionsSafe.existingNumbers && optionsSafe.existingNumbers.has(number)) {
        var original = optionsSafe.originalNumber ? normalizeNumber(optionsSafe.originalNumber) : null;
        if (original !== number) {
          errors.number = '该学号已存在';
        }
      }
    }

    var name = trimToString(source.name);
    if (!name) {
      errors.name = '请输入姓名';
    } else if (utf8ByteLength(name) > MAX_NAME_BYTES) {
      errors.name = '姓名过长，请控制在 21 个汉字（或 63 个英文字母）以内';
    } else if (/[\u0000-\u001f\u007f]/.test(name)) {
      errors.name = '姓名包含不支持的字符，请修改';
    } else {
      value.name = name;
    }

    SUBJECTS.forEach(function (subject) {
      var score = toNumberOrNaN(source[subject.key]);
      if (!Number.isFinite(score)) {
        errors[subject.key] = '请输入' + subject.label + '成绩';
      } else if (score < 0 || score > 100) {
        errors[subject.key] = subject.label + '成绩需在 0–100 之间';
      } else {
        value[subject.key] = round1(score);
      }
    });

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      value: value
    };
  }

  /* ------------------------------------------------------------------ *
   * 成绩计算
   * ------------------------------------------------------------------ */

  function studentTotal(student) {
    return round1(student.chinese + student.math + student.english);
  }

  function studentAverage(student) {
    return studentTotal(student) / 3;
  }

  function isAllPass(student) {
    return SUBJECTS.every(function (subject) {
      return student[subject.key] >= 60;
    });
  }

  function gradeInfo(score) {
    if (!Number.isFinite(score)) return { className: 'score--none', label: '—' };
    if (score >= 90) return { className: 'score--great', label: '优秀' };
    if (score >= 80) return { className: 'score--good', label: '良好' };
    if (score >= 60) return { className: 'score--warn', label: '及格' };
    return { className: 'score--bad', label: '不及格' };
  }

  function scoreBucketIndex(score) {
    if (score < 60) return 0;
    if (score < 70) return 1;
    if (score < 80) return 2;
    if (score < 90) return 3;
    return 4;
  }

  /* ------------------------------------------------------------------ *
   * 排序 / 筛选 / 统计
   * ------------------------------------------------------------------ */

  function sortStudents(list, sortKey, sortDir) {
    var key = sortKey || 'number';
    var direction = sortDir === -1 ? -1 : 1;
    var sorted = list.slice();
    sorted.sort(function (left, right) {
      var diff = 0;
      if (key === 'number') {
        diff = compareNumbers(left.number, right.number);
      } else if (key === 'name') {
        diff = String(left.name).localeCompare(String(right.name), 'zh-Hans-CN');
      } else if (key === 'total') {
        diff = studentTotal(left) - studentTotal(right);
      } else if (key === 'average') {
        diff = studentAverage(left) - studentAverage(right);
      } else if (SUBJECTS.some(function (subject) { return subject.key === key; })) {
        diff = left[key] - right[key];
      }
      if (diff !== 0) return diff * direction;
      return compareNumbers(left.number, right.number);
    });
    return sorted;
  }

  function filterStudents(students, options) {
    var opts = options || {};
    var query = trimToString(opts.query).toLowerCase();
    var filter = opts.filter || 'all';

    var filtered = students.filter(function (student) {
      if (query) {
        var hitNumber = String(student.number).toLowerCase().indexOf(query) !== -1;
        var hitName = String(student.name).toLowerCase().indexOf(query) !== -1;
        if (!hitNumber && !hitName) return false;
      }
      if (filter === 'fail') return !isAllPass(student);
      if (filter === 'pass') return isAllPass(student);
      if (filter === 'excellent') return studentAverage(student) >= 85;
      if (filter === 'low') return studentAverage(student) < 60;
      return true;
    });

    return sortStudents(filtered, opts.sortKey || 'number', opts.sortDir || 1);
  }

  function rankStudents(students) {
    return sortStudents(students, 'total', -1);
  }

  function computeStats(students) {
    var count = students.length;
    var emptySubjects = {};
    SUBJECTS.forEach(function (subject) {
      emptySubjects[subject.key] = { avg: 0, min: 0, max: 0, passRate: 0, excellentRate: 0, passCount: 0 };
    });

    if (count === 0) {
      return {
        count: 0,
        subjects: emptySubjects,
        avgTotal: 0,
        avgSubject: 0,
        passCount: 0,
        failCount: 0,
        passRate: 0,
        excellentCount: 0,
        maxTotal: 0,
        minTotal: 0,
        top: null,
        distribution: [0, 0, 0, 0, 0]
      };
    }

    var subjects = {};
    SUBJECTS.forEach(function (subject) {
      subjects[subject.key] = {
        avg: 0, min: Infinity, max: -Infinity, passCount: 0, excellentCount: 0,
        passRate: 0, excellentRate: 0
      };
    });

    var totalSum = 0;
    var passCount = 0;
    var excellentCount = 0;
    var maxTotal = -Infinity;
    var minTotal = Infinity;
    var top = null;
    var distribution = [0, 0, 0, 0, 0];

    students.forEach(function (student) {
      var total = studentTotal(student);
      var average = total / 3;

      totalSum += total;
      if (total > maxTotal) maxTotal = total;
      if (total < minTotal) minTotal = total;

      if (isAllPass(student)) passCount += 1;
      if (average >= 85) excellentCount += 1;
      distribution[scoreBucketIndex(average)] += 1;

      if (!top || total > studentTotal(top) ||
          (total === studentTotal(top) && compareNumbers(student.number, top.number) < 0)) {
        top = student;
      }

      SUBJECTS.forEach(function (subject) {
        var score = student[subject.key];
        var stat = subjects[subject.key];
        stat.avg += score;
        if (score < stat.min) stat.min = score;
        if (score > stat.max) stat.max = score;
        if (score >= 60) stat.passCount += 1;
        if (score >= 85) stat.excellentCount += 1;
      });
    });

    SUBJECTS.forEach(function (subject) {
      var stat = subjects[subject.key];
      stat.avg = round1(stat.avg / count);
      stat.passRate = (stat.passCount / count) * 100;
      stat.excellentRate = (stat.excellentCount / count) * 100;
    });

    var avgTotal = totalSum / count;

    return {
      count: count,
      subjects: subjects,
      avgTotal: avgTotal,
      avgSubject: totalSum / (count * SUBJECTS.length),
      passCount: passCount,
      failCount: count - passCount,
      passRate: (passCount / count) * 100,
      excellentCount: excellentCount,
      maxTotal: maxTotal,
      minTotal: minTotal,
      top: top,
      distribution: distribution
    };
  }

  function subjectDistribution(students) {
    return SUBJECTS.map(function (subject) {
      var buckets = [0, 0, 0, 0, 0];
      students.forEach(function (student) {
        buckets[scoreBucketIndex(student[subject.key])] += 1;
      });
      return { key: subject.key, label: subject.label, buckets: buckets };
    });
  }

  /* ------------------------------------------------------------------ *
   * 二进制编解码（与 C 结构体一致）
   * ------------------------------------------------------------------ */

  function encodeBinary(students) {
    var buffer = new ArrayBuffer(students.length * RECORD_SIZE);
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var encoder = new TextEncoder();

    students.forEach(function (student, index) {
      var offset = index * RECORD_SIZE;
      view.setBigUint64(offset, BigInt(student.number), true);

      var nameBytes = encoder.encode(String(student.name));
      if (nameBytes.length > MAX_NAME_BYTES) {
        nameBytes = nameBytes.subarray(0, MAX_NAME_BYTES);
      }
      // 其余字节保持 0，等价于 C 中的 '\0' 填充
      bytes.set(nameBytes, offset + NAME_OFFSET);

      view.setFloat32(offset + SCORE_OFFSET, Number(student.chinese), true);
      view.setFloat32(offset + SCORE_OFFSET + 4, Number(student.math), true);
      view.setFloat32(offset + SCORE_OFFSET + 8, Number(student.english), true);
      // offset + SCORE_OFFSET + 12 起 4 字节为对齐填充，保持 0
    });

    return new Uint8Array(buffer);
  }

  function toUint8Array(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  }

  /**
   * 解析 C 程序写出的 student.txt。
   * 同时兼容新版 88 字节记录与旧版 56 字节记录。
   * @returns {{ students: object[], errors: {index: number, reason: string}[], format: string }}
   */
  function decodeBinary(data) {
    var bytes = toUint8Array(data);
    if (!bytes) {
      return { students: [], errors: [{ index: -1, reason: '无法识别的数据格式' }], format: 'unknown' };
    }
    if (bytes.length === 0) {
      return { students: [], errors: [{ index: -1, reason: '文件为空，没有可导入的记录' }], format: 'unknown' };
    }

    var format = 'new';
    var recordSize = RECORD_SIZE;
    var nameFieldSize = NAME_FIELD_SIZE;
    var scoreOffset = SCORE_OFFSET;

    if (bytes.length % RECORD_SIZE !== 0) {
      if (bytes.length % LEGACY_RECORD_SIZE === 0) {
        // 旧版 56 字节文件：姓名 32 字节，成绩从偏移 40 开始
        format = 'legacy';
        recordSize = LEGACY_RECORD_SIZE;
        nameFieldSize = LEGACY_NAME_FIELD_SIZE;
        scoreOffset = LEGACY_SCORE_OFFSET;
      } else {
        return {
          students: [],
          errors: [{
            index: -1,
            reason: '文件格式不正确（长度 ' + bytes.length + ' 字节），请选择有效的学生数据文件'
          }],
          format: 'unknown'
        };
      }
    }

    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var decoder = new TextDecoder('utf-8', { fatal: true });
    var students = [];
    var errors = [];
    var seen = new Set();

    for (var offset = 0; offset < bytes.length; offset += recordSize) {
      var recordIndex = offset / recordSize;
      var number = view.getBigUint64(offset, true).toString();

      var nameBytes = bytes.subarray(offset + NAME_OFFSET, offset + NAME_OFFSET + nameFieldSize);
      var nulIndex = nameBytes.indexOf(0);
      var nameLength = nulIndex === -1 ? nameBytes.length : nulIndex;
      var name;
      try {
        name = decoder.decode(nameBytes.subarray(0, nameLength)).trim();
      } catch (error) {
        errors.push({ index: recordIndex, reason: '姓名数据格式不正确，已跳过' });
        continue;
      }

      var chinese = view.getFloat32(offset + scoreOffset, true);
      var math = view.getFloat32(offset + scoreOffset + 4, true);
      var english = view.getFloat32(offset + scoreOffset + 8, true);

      if (!name) {
        errors.push({ index: recordIndex, reason: '姓名为空，已跳过' });
        continue;
      }
      if (seen.has(number)) {
        errors.push({ index: recordIndex, reason: '学号 ' + number + ' 与前面的记录重复，已跳过' });
        continue;
      }

      var result = validateStudent({
        number: number,
        name: name,
        chinese: chinese,
        math: math,
        english: english
      });
      if (!result.valid) {
        var firstKey = Object.keys(result.errors)[0];
        errors.push({ index: recordIndex, reason: result.errors[firstKey] + '，已跳过' });
        continue;
      }

      seen.add(result.value.number);
      students.push(result.value);
    }

    return { students: students, errors: errors, format: format };
  }

  /* ------------------------------------------------------------------ *
   * JSON / CSV
   * ------------------------------------------------------------------ */

  function toJSONExport(students) {
    return JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      count: students.length,
      students: students.map(function (student) {
        return {
          number: student.number,
          name: student.name,
          chinese: student.chinese,
          math: student.math,
          english: student.english
        };
      })
    }, null, 2);
  }

  function parseJSONImport(text) {
    var parsed;
    try {
      // Windows 记事本另存为 UTF-8 时可能带 BOM，先去除
      parsed = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    } catch (error) {
      return { students: [], errors: [{ index: -1, reason: 'JSON 解析失败：' + error.message }] };
    }

    var list = null;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (isObject(parsed) && Array.isArray(parsed.students)) {
      list = parsed.students;
    }
    if (!list) {
      return { students: [], errors: [{ index: -1, reason: 'JSON 中未找到 students 数组' }] };
    }
    if (list.length === 0) {
      return { students: [], errors: [{ index: -1, reason: 'JSON 中没有学生记录' }] };
    }

    var students = [];
    var errors = [];
    var seen = new Set();

    list.forEach(function (raw, index) {
      var result = validateStudent(raw);
      if (!result.valid) {
        var firstKey = Object.keys(result.errors)[0];
        errors.push({ index: index, reason: result.errors[firstKey] + '，已跳过' });
        return;
      }
      if (seen.has(result.value.number)) {
        errors.push({ index: index, reason: '学号 ' + result.value.number + ' 与前一条记录重复，已跳过' });
        return;
      }
      seen.add(result.value.number);
      students.push(result.value);
    });

    return { students: students, errors: errors };
  }

  function csvEscape(value) {
    var text = String(value);
    // 防止 Excel 将 =、+、-、@ 开头的内容当作公式执行（CSV 公式注入）
    if (/^[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function toCSV(students) {
    var lines = ['学号,姓名,语文,数学,英语,总分,平均分'];
    students.forEach(function (student) {
      lines.push([
        csvEscape(student.number),
        csvEscape(student.name),
        formatScore(student.chinese),
        formatScore(student.math),
        formatScore(student.english),
        formatScore(studentTotal(student)),
        formatScore(studentAverage(student))
      ].join(','));
    });
    // BOM 让 Excel 正确识别 UTF-8 中文
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  /* ------------------------------------------------------------------ *
   * 示例数据
   * ------------------------------------------------------------------ */

  function demoStudents() {
    return [
      { number: '20240101', name: '张伟', chinese: 88, math: 92, english: 85 },
      { number: '20240102', name: '王芳', chinese: 95, math: 88, english: 91 },
      { number: '20240103', name: '李娜', chinese: 76, math: 81, english: 79 },
      { number: '20240104', name: '刘洋', chinese: 62, math: 58, english: 70 },
      { number: '20240105', name: '陈静', chinese: 90, math: 94, english: 96 },
      { number: '20240106', name: '杨磊', chinese: 55, math: 72, english: 60 },
      { number: '20240107', name: '赵敏', chinese: 84, math: 79, english: 88 },
      { number: '20240108', name: '黄强', chinese: 70, math: 65, english: 73 },
      { number: '20240109', name: '周婷', chinese: 98, math: 91, english: 94 },
      { number: '20240110', name: '吴昊', chinese: 45, math: 52, english: 48 },
      { number: '20240111', name: '徐悦', chinese: 81, math: 86, english: 77 },
      { number: '20240112', name: '孙晨', chinese: 67, math: 74, english: 71 }
    ];
  }

  /* ------------------------------------------------------------------ *
   * 本地存储
   * ------------------------------------------------------------------ */

  function createMemoryStorage() {
    var map = Object.create(null);
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
      },
      setItem: function (key, value) {
        map[key] = String(value);
      },
      removeItem: function (key) {
        delete map[key];
      }
    };
  }

  function StudentStore(storage) {
    this.storage = storage || createMemoryStorage();
    this.students = [];
    this.activity = [];
    this.demo = false;
    this.loaded = false;
    this.lastSavedAt = null;
    this.storageFailed = false;
    this.corrupt = false;
    this.skippedRecords = 0;
  }

  StudentStore.prototype.load = function () {
    var raw = null;
    var activityRaw = null;
    this.corrupt = false;
    this.skippedRecords = 0;
    try {
      raw = this.storage.getItem(STORAGE_KEYS.students);
      activityRaw = this.storage.getItem(STORAGE_KEYS.activity);
    } catch (error) {
      this.storageFailed = true;
    }

    if (activityRaw) {
      try {
        var activity = JSON.parse(activityRaw);
        if (Array.isArray(activity)) {
          this.activity = activity
            .filter(function (item) { return item && typeof item.message === 'string'; })
            .map(function (item) {
              var time = Number(item.time);
              return {
                type: ACTIVITY_TYPES.indexOf(item.type) !== -1 ? item.type : 'history',
                message: String(item.message).slice(0, 200),
                time: Number.isFinite(time) ? time : Date.now()
              };
            })
            .slice(0, 30);
        }
      } catch (error) {
        this.activity = [];
      }
    }

    if (!raw) {
      this.loaded = false;
      return false;
    }

    try {
      var payload = JSON.parse(raw);
      var list = payload && Array.isArray(payload.students) ? payload.students : [];
      var seen = new Set();
      var students = [];
      var skipped = 0;
      list.forEach(function (rawStudent) {
        var result = validateStudent(rawStudent);
        if (result.valid && !seen.has(result.value.number)) {
          seen.add(result.value.number);
          students.push(result.value);
        } else {
          skipped += 1;
        }
      });
      this.students = students;
      this.demo = !!(payload && payload.demo);
      this.lastSavedAt = payload && payload.savedAt ? payload.savedAt : null;
      this.skippedRecords = skipped;
      this.loaded = true;
      return true;
    } catch (error) {
      this.students = [];
      this.loaded = false;
      this.corrupt = true;
      return false;
    }
  };

  StudentStore.prototype.persist = function () {
    var payload = {
      version: 1,
      demo: this.demo,
      savedAt: Date.now(),
      students: this.students
    };
    try {
      this.storage.setItem(STORAGE_KEYS.students, JSON.stringify(payload));
      this.storage.setItem(STORAGE_KEYS.activity, JSON.stringify(this.activity));
      this.lastSavedAt = payload.savedAt;
      this.storageFailed = false;
      return true;
    } catch (error) {
      this.storageFailed = true;
      return false;
    }
  };

  StudentStore.prototype.log = function (type, message) {
    this.activity.unshift({
      id: Date.now() + '-' + Math.random().toString(16).slice(2),
      type: type,
      message: message,
      time: Date.now()
    });
    if (this.activity.length > 30) {
      this.activity.length = 30;
    }
  };

  StudentStore.prototype.add = function (student) {
    var record = {
      number: student.number,
      name: student.name,
      chinese: student.chinese,
      math: student.math,
      english: student.english
    };
    this.students.push(record);
    this.log('add', '添加学生 ' + record.name + '（' + record.number + '）');
    this.persist();
    return record;
  };

  StudentStore.prototype.update = function (originalNumber, student) {
    var index = -1;
    for (var i = 0; i < this.students.length; i += 1) {
      if (this.students[i].number === originalNumber) {
        index = i;
        break;
      }
    }
    if (index === -1) throw new Error('未找到该学生');
    var old = this.students[index];
    var record = {
      number: student.number,
      name: student.name,
      chinese: student.chinese,
      math: student.math,
      english: student.english
    };
    this.students[index] = record;
    var message = old.number === record.number
      ? '修改学生 ' + record.name + '（' + record.number + '）的成绩'
      : '修改学生 ' + old.name + '（' + old.number + ' → ' + record.number + '）';
    this.log('update', message);
    this.persist();
    return index;
  };

  StudentStore.prototype.remove = function (number) {
    var index = -1;
    for (var i = 0; i < this.students.length; i += 1) {
      if (this.students[i].number === number) {
        index = i;
        break;
      }
    }
    if (index === -1) throw new Error('未找到该学生');
    var removed = this.students.splice(index, 1)[0];
    this.log('remove', '删除学生 ' + removed.name + '（' + removed.number + '）');
    this.persist();
    return { student: removed, index: index };
  };

  StudentStore.prototype.restore = function (student, index) {
    var duplicate = this.students.some(function (item) {
      return item.number === student.number;
    });
    if (duplicate) {
      throw new Error('学号 ' + student.number + ' 已被重新添加，无法撤销删除');
    }
    var position = Math.max(0, Math.min(Number(index) || 0, this.students.length));
    this.students.splice(position, 0, student);
    this.log('restore', '撤销删除：恢复学生 ' + student.name + '（' + student.number + '）');
    this.persist();
  };

  StudentStore.prototype.replaceAll = function (students, options) {
    var opts = options || {};
    this.students = students.map(function (student) {
      return {
        number: student.number,
        name: student.name,
        chinese: student.chinese,
        math: student.math,
        english: student.english
      };
    });
    if (typeof opts.demo === 'boolean') this.demo = opts.demo;
    this.log(opts.activityType || 'import', opts.message || ('导入 ' + this.students.length + ' 条学生记录'));
    this.persist();
  };

  StudentStore.prototype.clear = function () {
    var count = this.students.length;
    this.students = [];
    this.demo = false;
    this.log('clear', '清空全部数据（共 ' + count + ' 条记录）');
    this.persist();
  };

  StudentStore.prototype.clearActivity = function () {
    this.activity = [];
    this.persist();
  };

  StudentStore.prototype.storageSize = function () {
    try {
      return utf8ByteLength(
        JSON.stringify({ students: this.students, activity: this.activity })
      );
    } catch (error) {
      return 0;
    }
  };

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  return {
    RECORD_SIZE: RECORD_SIZE,
    NAME_FIELD_SIZE: NAME_FIELD_SIZE,
    MAX_NAME_BYTES: MAX_NAME_BYTES,
    LEGACY_RECORD_SIZE: LEGACY_RECORD_SIZE,
    LEGACY_NAME_FIELD_SIZE: LEGACY_NAME_FIELD_SIZE,
    LEGACY_SCORE_OFFSET: LEGACY_SCORE_OFFSET,
    MAX_UINT64_STRING: MAX_UINT64.toString(),
    STORAGE_KEYS: STORAGE_KEYS,
    SUBJECTS: SUBJECTS,
    SCORE_BUCKETS: SCORE_BUCKETS,

    normalizeNumber: normalizeNumber,
    compareNumbers: compareNumbers,
    validateStudent: validateStudent,
    utf8ByteLength: utf8ByteLength,

    studentTotal: studentTotal,
    studentAverage: studentAverage,
    isAllPass: isAllPass,
    gradeInfo: gradeInfo,
    scoreBucketIndex: scoreBucketIndex,

    sortStudents: sortStudents,
    filterStudents: filterStudents,
    rankStudents: rankStudents,
    computeStats: computeStats,
    subjectDistribution: subjectDistribution,

    encodeBinary: encodeBinary,
    decodeBinary: decodeBinary,
    toJSONExport: toJSONExport,
    parseJSONImport: parseJSONImport,
    toCSV: toCSV,

    demoStudents: demoStudents,

    formatScore: formatScore,
    formatPercent: formatPercent,
    formatBytes: formatBytes,

    createMemoryStorage: createMemoryStorage,
    StudentStore: StudentStore
  };
});
