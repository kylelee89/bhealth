/**
 * ══════════════════════════════════════════════════════════════
 * 내 건강 기록 앱 — Google Apps Script API
 * ══════════════════════════════════════════════════════════════
 *
 * [사용 방법]
 * 1. https://script.google.com → 새 프로젝트 → 이 코드 붙여넣기
 * 2. 확장 프로그램 메뉴에서 Apps Script 열기 (시트에서: 확장 프로그램 → Apps Script)
 * 3. 실행 → enrichLabDefs()   ← 시트5에서 시트3으로 항목 추가
 * 4. 실행 → addMissingData()  ← 시트1/시트2에 누락 데이터 추가
 * 5. 배포 → 웹 앱으로 배포 → 액세스: 모든 사용자(익명) → 배포
 * 6. 배포 URL → index.html 의 SHEETS_URL 에 붙여넣기
 *
 * [실제 시트 구조]
 *   시트1: date | drug | type | title | place | time | status
 *   시트2: date | key | value | memo
 *   시트3: key | name | unit | normal_min | normal_max | higher_is_better | category
 *   시트4: key | value  (프로필)
 *   시트5: 건강검진 항목 참조표 (읽기 전용)
 *
 *   type 값: 항암 / 검진 / 외래 / 이노크라스 / 기타
 *   이노크라스 key: Inocras_소변 (수치) / Inocras_혈액 (0=ND, 1=D)
 * ══════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────
// API 엔드포인트 — 앱에서 fetch()로 호출
// ────────────────────────────────────────────────────────
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  return ContentService
    .createTextOutput(JSON.stringify({
      schedule  : readSheet(ss, '시트1', tz),
      labs      : readSheet(ss, '시트2', tz),
      labDefs   : readSheet(ss, '시트3', tz),
      profile   : readSheet(ss, '시트4', tz),
      updatedAt : new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────
// 시트 읽기 헬퍼
// ────────────────────────────────────────────────────────
function readSheet(ss, name, tz) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1)
    .filter(r => r[0] !== '' && r[0] !== null && r[0] !== undefined)
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = r[i];
        obj[h] = (v instanceof Date)
          ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
          : v;
      });
      return obj;
    });
}

// ────────────────────────────────────────────────────────
// ① 시트3에 누락된 항목 추가 (시트5 참조)
//    Apps Script 편집기에서 직접 실행하세요
// ────────────────────────────────────────────────────────
function enrichLabDefs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet3 = ss.getSheetByName('시트3');
  if (!sheet3) { Logger.log('시트3 없음'); return; }

  // 시트3의 기존 key 목록
  const existing = sheet3.getDataRange().getValues().slice(1).map(r => String(r[0]));

  // 추가할 항목 (key, name, unit, normal_min, normal_max, higher_is_better, category)
  const toAdd = [
    ['Hb',     '헤모글로빈',  'g/dL',      12,   16,    false, '혈액검사'],
    ['PLT',    '혈소판',      '×1000/μL', 150,  400,    false, '혈액검사'],
    ['Cr',     '크레아티닌',  'mg/dL',    0.6,   1.2,   false, '신기능'],
    ['CEA',    'CEA',        'ng/mL',      0,    5,     false, '종양표지자'],
    ['CA19-9', 'CA19-9',     'U/mL',       0,   37,     false, '종양표지자'],
    ['NMP22',  'NMP22',      'U/mL',       0,   10,     false, '방광암표지자'],  // 이미 있을 수 있음
  ].filter(r => !existing.includes(r[0]));

  if (toAdd.length === 0) {
    Logger.log('추가할 항목 없음 (이미 모두 존재)');
    return;
  }

  const lastRow = sheet3.getLastRow();
  sheet3.getRange(lastRow + 1, 1, toAdd.length, toAdd[0].length).setValues(toAdd);
  Logger.log('추가 완료: ' + toAdd.map(r => r[0]).join(', '));
}

// ────────────────────────────────────────────────────────
// ② 시트1/시트2에 누락 데이터 추가
//    Apps Script 편집기에서 직접 실행하세요
// ────────────────────────────────────────────────────────
function addMissingData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _addMissingSchedule(ss);
  _addMissingLabs(ss);
  Logger.log('✅ 누락 데이터 추가 완료');
  SpreadsheetApp.getUi().alert('누락 데이터 추가 완료!');
}

function _addMissingSchedule(ss) {
  const sheet = ss.getSheetByName('시트1');
  if (!sheet) return;

  // 기존 date+title 조합으로 중복 체크
  const existing = new Set(
    sheet.getDataRange().getValues().slice(1)
      .filter(r => r[0])
      .map(r => String(r[0]) + '|' + String(r[3]))
  );

  // 추가할 일정 [date, drug, type, title, place, time, status]
  const toAdd = [
    // BCG 추가 세션
    ['2026-01-06', 'BCG',    '항암',   'BCG 주입 3차',    '비뇨의학과 처치실', '14:00', 'done'],
    ['2026-02-03', 'BCG',    '항암',   'BCG 주입 4차',    '비뇨의학과 처치실', '14:00', 'done'],
    ['2026-03-03', 'BCG',    '항암',   'BCG 주입 5차',    '비뇨의학과 처치실', '14:00', 'done'],
    // GC 항암
    ['2026-02-03', 'GC',     '항암',   'GC 항암 1차',     '주사실 3번',        '09:00', 'done'],
    ['2026-02-17', 'GC',     '항암',   'GC 항암 2차',     '주사실 3번',        '09:00', 'done'],
    ['2026-03-03', 'GC',     '항암',   'GC 항암 3차',     '주사실 3번',        '09:00', 'done'],
    ['2026-03-17', 'GC',     '항암',   'GC 항암 4차',     '주사실 3번',        '09:00', 'done'],
    ['2026-03-31', 'GC',     '항암',   'GC 항암 5차',     '주사실 3번',        '09:00', 'upcoming'],
    ['2026-04-21', 'GC',     '항암',   'GC 항암 6차',     '주사실 3번',        '09:00', 'upcoming'],
    // 키트루다 추가 세션
    ['2026-02-17', '키트루다', '항암', '키트루다 2차',     '주사실 2번',        '10:00', 'done'],
    ['2026-03-03', '키트루다', '항암', '키트루다 3차',     '주사실 2번',        '10:00', 'done'],
    ['2026-03-17', '키트루다', '항암', '키트루다 4차',     '주사실 2번',        '10:00', 'done'],
    // 이노크라스 이전 채취
    ['2025-12-15', '',       '이노크라스', '이노크라스 소변 채취', '검사실', '09:00', 'done'],
    ['2026-02-03', '',       '이노크라스', '이노크라스 소변 채취', '검사실', '09:00', 'done'],
    // 추가 검진/외래
    ['2026-03-28', '',       '검진',   '혈액 검사 (CBC)', '검사실 1층',        '08:00', 'upcoming'],
    ['2026-04-14', '',       '검진',   'CT 촬영 (복부/골반)', '영상의학과',     '14:00', 'upcoming'],
  ].filter(r => !existing.has(r[0] + '|' + r[3]));

  if (!toAdd.length) { Logger.log('시트1: 추가할 일정 없음'); return; }
  sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, toAdd[0].length).setValues(toAdd);
  Logger.log('시트1: ' + toAdd.length + '건 추가');
}

function _addMissingLabs(ss) {
  const sheet = ss.getSheetByName('시트2');
  if (!sheet) return;

  const existing = new Set(
    sheet.getDataRange().getValues().slice(1)
      .filter(r => r[0])
      .map(r => String(r[0]) + '|' + String(r[1]))
  );

  // [date, key, value, memo]
  const toAdd = [
    // 이노크라스 초기 데이터
    ['2025-12-01', 'Inocras_소변', 8.5,  ''],
    ['2025-12-01', 'Inocras_혈액', 0,    '0=ND'],
    ['2026-01-20', 'Inocras_소변', 7.2,  ''],
    // WBC 추가 시점
    ['2025-10-15','WBC',   7200,  ''], ['2025-11-01','WBC',  6800, ''],
    ['2025-11-15','WBC',   6500,  ''], ['2025-12-01','WBC',  6100, ''],
    ['2025-12-15','WBC',   5800,  ''], ['2026-01-01','WBC',  6200, ''],
    ['2026-01-15','WBC',   5900,  ''], ['2026-02-03','WBC',  4800, ''],
    ['2026-02-17','WBC',   3900,  ''], ['2026-03-03','WBC',  5100, ''],
    // Hb 전체 이력
    ['2025-10-15','Hb',   13.5,  ''], ['2025-11-01','Hb',  13.1, ''],
    ['2025-11-15','Hb',   12.8,  ''], ['2025-12-01','Hb',  12.5, ''],
    ['2025-12-15','Hb',   12.1,  ''], ['2026-01-01','Hb',  12.5, ''],
    ['2026-01-15','Hb',   11.8,  ''], ['2026-02-03','Hb',  11.2, ''],
    ['2026-02-17','Hb',   11.6,  ''], ['2026-03-03','Hb',  11.0, ''],
    ['2026-03-26','Hb',   10.8,  ''],
    // NMP22 이력
    ['2025-10-15','NMP22', 12,   ''], ['2025-11-01','NMP22', 10,  ''],
    ['2025-12-01','NMP22', 7.2,  ''], ['2026-01-06','NMP22', 6.5, ''],
    ['2026-02-03','NMP22', 5.9,  ''], ['2026-02-17','NMP22', 5.2, ''],
    ['2026-03-03','NMP22', 4.9,  ''],
    // RBC 이력
    ['2025-10-15','RBC',  4.8,   ''], ['2025-11-01','RBC',  4.6, ''],
    ['2025-12-01','RBC',  4.4,   ''], ['2026-01-06','RBC',  4.2, ''],
    ['2026-02-03','RBC',  4.0,   ''], ['2026-02-17','RBC',  3.9, ''],
    ['2026-03-03','RBC',  3.8,   ''],
    // NLR 이력
    ['2025-10-15','NLR',  2.8,   ''], ['2025-11-01','NLR',  3.2, ''],
    ['2025-12-01','NLR',  2.9,   ''], ['2026-01-06','NLR',  3.5, ''],
    ['2026-02-03','NLR',  2.7,   ''], ['2026-02-17','NLR',  3.1, ''],
    ['2026-03-03','NLR',  2.8,   ''],
    // PSA 이력
    ['2025-10-15','PSA',  0.8,   ''], ['2025-11-01','PSA',  0.7, ''],
    ['2025-12-01','PSA',  0.7,   ''], ['2026-01-06','PSA',  0.6, ''],
    ['2026-02-03','PSA',  0.6,   ''], ['2026-02-17','PSA',  0.5, ''],
    ['2026-03-03','PSA',  0.5,   ''],
    // eGFR 이력
    ['2025-10-15','eGFR', 72,    ''], ['2025-11-01','eGFR', 70,  ''],
    ['2025-12-01','eGFR', 68,    ''], ['2026-01-06','eGFR', 65,  ''],
    ['2026-02-03','eGFR', 63,    ''], ['2026-02-17','eGFR', 62,  ''],
    ['2026-03-03','eGFR', 61,    ''],
    // Cr 이력
    ['2025-10-15','Cr',   0.9,   ''], ['2025-11-01','Cr',  0.95, ''],
    ['2025-11-15','Cr',   1.0,   ''], ['2025-12-01','Cr',  1.05, ''],
    ['2025-12-15','Cr',   1.02,  ''], ['2026-01-01','Cr',  0.98, ''],
    ['2026-01-15','Cr',   1.05,  ''], ['2026-02-03','Cr',  1.08, ''],
    ['2026-02-17','Cr',   1.05,  ''], ['2026-03-03','Cr',   1.1, ''],
    ['2026-03-17','Cr',   1.08,  ''], ['2026-03-26','Cr',   1.1, ''],
    // CEA 이력
    ['2025-10-15','CEA',  5.2,   ''], ['2025-11-01','CEA',  4.8, ''],
    ['2025-11-15','CEA',  4.5,   ''], ['2025-12-01','CEA',  4.1, ''],
    ['2025-12-15','CEA',  3.8,   ''], ['2026-01-01','CEA',  3.5, ''],
    ['2026-01-15','CEA',  3.2,   ''], ['2026-02-03','CEA',  2.9, ''],
    ['2026-02-17','CEA',  2.7,   ''], ['2026-03-03','CEA',  2.5, ''],
    ['2026-03-17','CEA',  2.3,   ''], ['2026-03-26','CEA',  2.1, ''],
    // CA19-9 이력
    ['2025-10-15','CA19-9', 38,  ''], ['2025-11-01','CA19-9', 35, ''],
    ['2025-11-15','CA19-9', 32,  ''], ['2025-12-01','CA19-9', 29, ''],
    ['2025-12-15','CA19-9', 27,  ''], ['2026-01-01','CA19-9', 25, ''],
    ['2026-01-15','CA19-9', 23,  ''], ['2026-02-03','CA19-9', 21, ''],
    ['2026-02-17','CA19-9', 20,  ''], ['2026-03-03','CA19-9', 18, ''],
    ['2026-03-17','CA19-9', 17,  ''], ['2026-03-26','CA19-9', 16, ''],
    // PLT 이력
    ['2025-10-15','PLT', 220,    ''], ['2025-11-01','PLT', 198,   ''],
    ['2025-11-15','PLT', 165,    ''], ['2025-12-01','PLT', 180,   ''],
    ['2025-12-15','PLT', 155,    ''], ['2026-01-01','PLT', 168,   ''],
    ['2026-01-15','PLT', 148,    ''], ['2026-02-03','PLT', 142,   ''],
  ].filter(r => !existing.has(r[0] + '|' + r[1]));

  if (!toAdd.length) { Logger.log('시트2: 추가할 데이터 없음'); return; }
  sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, toAdd[0].length).setValues(toAdd);
  Logger.log('시트2: ' + toAdd.length + '행 추가');
}
