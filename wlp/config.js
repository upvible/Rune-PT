/* WLP 설정 — 서버를 옮길 때는 이 파일만 바꾸면 돼요 (WLP-이식-가이드.md 참고) */
window.WLP_CFG = {
  SB_URL: 'https://vpdemapnpunsuxqdffgn.supabase.co',          // 시범 운영: 개인 Supabase. 이식 후 회사 프로젝트 주소로
  SB_KEY: 'sb_publishable_fonyE5eloRwvXb7hacPTow_d6JR0zMv',     // 공개용(publishable) 키만. secret/service 키는 절대 넣지 않기
  LEGACY_RUNE: true,            // 시범 기간에만 룬 PT 의 수업 루틴·운동 기록을 '읽기만' 해요. 분리 후 false
  RUNE_APP_URL: '../index.html',// 룬 PT 기록 앱 주소 (LEGACY_RUNE 가 true 일 때만 링크 표시)
  // 태블릿 직원 화면 번호는 서버에 저장돼요 (center.html → 직원 승인 탭에서 변경). 아래 값은 시험 모드 전용
  SHEET_SYNC_URL: '',   // 시트 Apps Script 웹 앱 주소 (https://script.google.com/macros/s/.../exec). 비워 두면 버튼이 안내만 해요
  LAYOUT_CODE: '9999',   // 회원 폰 '화면 구성'을 여는 트레이너 코드 (기기 저장용 잠금일 뿐, 보안 장치 아님)
  STAFF_PIN: '0000',
  // 시험 모드: 파일로 열었거나 localhost 이거나 주소 뒤에 ?demo
  DEMO: location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has('demo')
};
