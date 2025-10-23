// @ts-nocheck
import 'dotenv/config'
import fs from 'fs'
import express from 'express'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import open from 'open'
import { URL as UrlParser, fileURLToPath } from 'url'
import path from 'path'
import fetch from 'node-fetch'
import ioClient from 'socket.io-client'
import { Server as SocketIoServer } from 'socket.io' // 오버레이 서버를 위해 추가

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- 오버레이를 위한 웹 서버 및 웹소켓 설정 ---
const app = express();
const server = http.createServer(app);
const io = new SocketIoServer(server); // socket.io 서버 생성
const PORT = 3002;

// chat-overlay.html 파일 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'chatbox-overlay.html'));
});

// jumpsuji.png와 같은 로컬 이미지 파일 제공
app.use(express.static(__dirname));

io.on('connection', (socket) => {
  console.log('✅ 오버레이가 서버에 연결되었습니다.');
  socket.on('disconnect', () => {
    console.log('❌ 오버레이 연결이 끊겼습니다.');
  });
});
// --- 서버 설정 끝 ---

// --- ✨ 블랙리스트 설정 (여기에 차단할 닉네임을 추가하세요) ---
const blacklist = new Set([
    '빵떡',
    '스팸봇_01',
    '비매너채팅'
]);
// ---------------------------------------------------------




function nowSec(){ return Math.floor(Date.now()/1000) }
function isTokenValid(){
  const b = process.env.CHZZK_BEARER
  const i = Number(process.env.CHZZK_ISSUED_AT || 0)
  const e = Number(process.env.CHZZK_EXPIRES_IN || 0)
  return !!b && Number.isFinite(i) && Number.isFinite(e) && (nowSec() < i + e - 60)
}

async function startChzzkSession() { 
  const BEARER_TOKEN = process.env.CHZZK_BEARER;
  // 1) 세션 URL 발급
  const authRes = await fetch('https://openapi.chzzk.naver.com/open/v1/sessions/auth', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const authJson = await authRes.json();
  const sessionUrl = authJson.content.url;
  console.log("authRes : " +JSON.stringify(authJson, null, 2));

  // 2) 치지직 Socket.IO 연결 (웹소켓 전용)
  const chzzkSocket = ioClient(sessionUrl, { // 혼동을 피하기 위해 chzzkSocket으로 이름 변경
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    path: '/socket.io',
    timeout: 5000
  });

  chzzkSocket.on('error', async(msg)=>{
    const payload = (typeof msg === 'string') ? JSON.parse(msg) : msg;
    console.error("connection error!!" + msg);
  });

  chzzkSocket.on('connect', () => {
    const info = {
      id:              chzzkSocket.id,
      connected:       chzzkSocket.connected,
      sessionUrl:      authJson.content.url,
      protocol:        chzzkSocket.io.engine.protocol,
      transport:       chzzkSocket.io.engine.transport.name,
      path:            chzzkSocket.io.opts.path,
      query:           chzzkSocket.io.engine.transport.query,
      sessionKey:      chzzkSocket.io.engine.transport.query.auth,
      finalUrl:        chzzkSocket.io.engine.transport.ws.url
    };
    console.log(JSON.stringify(info, null, 2));
  });

  // 4) SYSTEM 이벤트 처리
  chzzkSocket.on('SYSTEM', async (msg) => {
    const payload = (typeof msg === 'string') ? JSON.parse(msg) : msg;
    console.log('◼ SYSTEM event:', payload);

    if (payload.type === 'connected' && payload.data?.sessionKey) {
      const sessionKey = payload.data.sessionKey;
      console.log('  ↳ sessionKey =', sessionKey);

      // 4-a) 채팅 이벤트 구독
      await fetch(
        `https://openapi.chzzk.naver.com/open/v1/sessions/events/subscribe/chat?sessionKey=${sessionKey}`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${BEARER_TOKEN}`, 'Content-Type': 'application/json' } }
      );

      // 4-b) 후원 이벤트 구독
      const donationSubRes = await fetch(
        `https://openapi.chzzk.naver.com/open/v1/sessions/events/subscribe/donation?sessionKey=${sessionKey}`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${BEARER_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      console.log(' ↳ donation subscribe:', await donationSubRes.json());

      // 5) CHAT / DONATION 이벤트 바인딩
      chzzkSocket.on('CHAT', (chatMsg) => {
        const chat = (typeof chatMsg === 'string') ? JSON.parse(chatMsg) : chatMsg;
        const nickname = chat.profile?.nickname;
        const content = chat.content;
        

        if (blacklist.has(nickname)) {
         
            return; // 함수를 여기서 종료하여 오버레이로 메시지를 보내지 않음
        }


     if (nickname && content) {
        console.log(`💬 [${nickname}] ${content}`);
        // ✨ 변경됨: 닉네임과 메시지를 객체 형태로 전송
        io.emit('new-chat', {
            nickname: nickname,
            message: content
        }); 
    }
      });
      chzzkSocket.on('DONATION', (donationMsg) => {
        const don = (typeof donationMsg === 'string') ? JSON.parse(donationMsg) : donationMsg;
        console.log('🎁 DONATION event:', don);


     // ✨ 변경됨: '슛' 메시지를 감지하고 별도의 이벤트 전송
        if (don.donationText && don.donationText.trim() === '슛') {
            console.log("🔫 '슛' 명령 감지! 오버레이로 명령 전송.");
            io.emit('shoot-command');
        } else if (don.payAmount && don.donationText) {
            const donationData = {
                amount: don.payAmount,
                message: don.donationText,
                nickname: don.donatorNickname
            };
            io.emit('new-donation', donationData);
        }
        // ---
      });
    }
  });

  chzzkSocket.on('connect_error', (err) => {
    console.error('⚠ connect_error', err);
  });
  chzzkSocket.on('disconnect', (reason) => {
    console.log('⚠ disconnected', reason);
  });
}

export async function GetCode(opts={}){
  const { openBrowser=true, providedState, timeoutMs=180000 } = opts
  const clientId = process.env.CHZZK_CLIENT_ID
  const redirectUri = process.env.CHZZK_REDIRECT_URI
  if(!clientId || !redirectUri) throw new Error('missing CLIENT_ID or REDIRECT_URI')

  const ru = new UrlParser(redirectUri)
  const host = ru.hostname
  const port = Number(ru.port || (ru.protocol === 'https' ? 443 : 80))
  const pathName = ru.pathname

  const state = providedState || crypto.randomBytes(16).toString('base64url')
  const accountUrl = new UrlParser('https://chzzk.naver.com/account-interlock')
  accountUrl.searchParams.set('clientId', clientId)
  accountUrl.searchParams.set('redirectUri', redirectUri)
  accountUrl.searchParams.set('state', state)

  const authApp = express() // 인증용으로 임시 express 앱 사용
  const authServer = http.createServer(authApp)

  const wait = new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{ try{authServer.close()}catch{}; reject(new Error('timeout')) }, timeoutMs)
    authApp.get(pathName, (req, res)=>{
      const { code, state:returnedState } = req.query
      if(!code || !returnedState || returnedState !== state){
        res.status(400).send('invalid state/code')
        clearTimeout(timer); reject(new Error('invalid state/code')); return
      }
      res.status(200).send('OK. You can close this window.')
      clearTimeout(timer); resolve({ code:String(code), state:String(returnedState) })
      setTimeout(()=>{ try{authServer.close()}catch{} }, 50)
    })
    
    authServer.listen(port, host, ()=>{
      if(openBrowser) open(accountUrl.toString())
    })
  })

  return await wait
}

async function getToken(authorizationCode, stateValue) {
  const tokenUrl = 'https://openapi.chzzk.naver.com/auth/v1/token';
  const clientId = process.env.CHZZK_CLIENT_ID;
  const clientSecret = process.env.CHZZK_CLIENT_SECRET;
  if (!clientSecret) throw new Error('missing CLIENT_SECRET');

  const payload = {
    grantType: 'authorization_code',
    clientId: clientId,
    clientSecret: clientSecret,
    code: authorizationCode,
    state: stateValue,
  };

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const tokens = await response.json();
    if (!response.ok) {
      console.error('Failed to get token:', tokens);
      throw new Error(tokens.message || 'An unknown error occurred');
    }
    return tokens;
  } catch (error) {
    console.error('Error in getToken:', error);
    throw error;
  }
}

// --- 전체 실행 흐름 ---
async function main() {
  try {
    // 오버레이용 서버를 먼저 실행
    server.listen(PORT, () => {
      console.log(`🚀 오버레이 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
      console.log('OBS/XSplit 등 방송 프로그램의 브라우저 소스에 위 주소를 입력하세요.');
    });

    console.log('\n1단계: 인증 코드 받는 중...');
    const { code, state } = await GetCode();
    console.log(`1단계 성공! Code: ${code}`);

    console.log('\n2단계: 액세스 토큰으로 교환 중...');
    const tokenInfo = await getToken(code, state);
    if (!tokenInfo || !tokenInfo.content.accessToken) {
        throw new Error('유효한 액세스 토큰을 받지 못했습니다.');
    }
    console.log(`2단계 성공! Access Token 확인.`);
    process.env.CHZZK_BEARER = tokenInfo.content.accessToken;

    console.log('\n3단계: 치지직 세션 시작 중...');
    await startChzzkSession();
    console.log('\n🎉 모든 시스템 준비 완료! 치지직 채팅 메시지를 기다립니다.');

  } catch (error) {
    console.error('\n인증 과정 실패:', error.message);
    // 인증 실패 시 서버 종료
    server.close();
  }
}

main();