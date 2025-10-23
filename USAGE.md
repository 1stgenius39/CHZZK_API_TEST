# Chzzk 채팅 오버레이 시스템 사용법

이 시스템은 Chzzk 스트리밍 플랫폼의 채팅과 후원 이벤트를 실시간으로 받아서 이미지 오버레이로 표시하는 시스템입니다.

## 설치 및 실행

1. **의존성 설치**
   ```bash
   npm install
   ```

2. **환경 변수 설정**
   `.env` 파일을 생성하고 다음 정보를 입력하세요:
   ```
   CHZZK_CLIENT_ID=your_client_id
   CHZZK_CLIENT_SECRET=your_client_secret
   CHZZK_REDIRECT_URI=http://localhost:8080/callback
   OVERLAY_PORT=3000
   ```

3. **시스템 실행**
   ```bash
   node chzzk.js
   ```

4. **오버레이 열기**
   - 브라우저에서 `http://localhost:3000/chat-overlay.html`을 열어주세요
   - 오버레이 창이 열리고 WebSocket 연결 상태가 표시됩니다

## 기능

### 채팅 연동
- Chzzk 채팅에서 특정 키워드가 입력되면 이미지가 표시됩니다
- 설정된 키워드: "화이팅", "ㅋㅋㅋ", "축하", "사랑해", "대박"
- 이미지 URL이 포함된 메시지도 자동으로 표시됩니다

### 후원 연동
- 후원 이벤트가 발생하면 실시간으로 오버레이에 전달됩니다
- 후원 키워드: "점프스지" (jumpsuji.png 이미지 표시)

### 테스트 기능
- 오버레이 하단의 테스트 패널을 통해 수동으로 테스트할 수 있습니다
- 채팅 메시지나 후원을 시뮬레이션할 수 있습니다

## 설정 변경

`chat-overlay.html` 파일의 설정 영역에서 다음을 변경할 수 있습니다:

- **키워드 및 이미지 매핑**: `wordImageMap` 객체 수정
- **후원 키워드**: `donationKeywordImageMap` 객체 수정
- **이미지 크기**: `IMAGE_MAX_WIDTH`, `IMAGE_MAX_HEIGHT` 값 변경
- **애니메이션 시간**: `FADE_IN_DURATION`, `STAY_DURATION`, `FADE_OUT_DURATION` 값 변경
- **후원 설정**: `DONATION_UNIT_AMOUNT`, `USES_PER_UNIT` 값 변경

## 문제 해결

- **연결 안됨**: 오버레이 창 우상단의 연결 상태를 확인하세요
- **이미지 안보임**: 이미지 파일 경로와 키워드 설정을 확인하세요
- **채팅 안됨**: Chzzk API 인증이 제대로 되었는지 확인하세요
