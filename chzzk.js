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
import io from 'socket.io-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  const sessionUrl = authJson.content.url;  // 예: https://ssioXX.nchat.naver.com:443?auth=…
  console.log("authRes : " +JSON.stringify(authJson, null, 2));

  // 2) Socket.IO 연결 (WebSocket 전용)
  const socket = io(sessionUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    path: '/socket.io',
    timeout: 5000
  });

  socket.on('error', async(msg)=>{

    const payload = (typeof msg === 'string') ? JSON.parse(msg) : msg;
    console.error("connection error!!" + msg);
  });

  socket.on('connect', () => {
    const info = {
      id:              socket.id,
      connected:       socket.connected,
      sessionUrl:      authJson.content.url,
      protocol:        socket.io.engine.protocol,         // EIO 버전
      transport:       socket.io.engine.transport.name,   // websocket or polling
      path:            socket.io.opts.path,               // '/socket.io'
      query:           socket.io.engine.transport.query,  // auth, t 등
      sessionKey:      socket.io.engine.transport.query.auth, // auth 토큰
      finalUrl:        socket.io.engine.transport.ws.url
    };
    console.log(JSON.stringify(info, null, 2));
    console.log("secure : " + socket.io.opts.secure);        // secure 옵션(true/false)
    console.log(socket.io.engine.transport.name); // 'websocket'
    console.log(socket.io.opts.transports);     // ['websocket']

  });

  // 4) SYSTEM 이벤트 처리
  socket.on('SYSTEM', async (msg) => {
    // msg가 문자열이면 파싱
    const payload = (typeof msg === 'string') ? JSON.parse(msg) : msg;
    console.log('◼ SYSTEM event:', payload);

    if (payload.type === 'connected' && payload.data?.sessionKey) {
      const sessionKey = payload.data.sessionKey;
      console.log('  ↳ sessionKey =', sessionKey);

      // 4-a) 채팅 이벤트 구독
      const chatSubRes = await fetch(
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
      socket.on('CHAT', (chatMsg) => {
        // chatMsg도 문자열일 수 있으니 필요시 JSON.parse
        const chat = (typeof chatMsg === 'string') ? JSON.parse(chatMsg) : chatMsg;
        const nickname = chat.profile?.nickname;
        const content = chat.content;
        // console.log('💬 CHAT event:', chat);
        if (nickname && content) {
            console.log(`[${nickname}] ${content}`);
        }
        //여기에 일천 넣고싶은거 넣어서 쓰셈
        if(content.includes("쯔모"))
        {
            console.log("일천바보");
        }

      });
      socket.on('DONATION', (donationMsg) => {
        const don = (typeof donationMsg === 'string') ? JSON.parse(donationMsg) : donationMsg;
        console.log('🎁 DONATION event:', don);
      });
    }
  });

  socket.on('connect_error', (err) => {
    console.error('⚠ connect_error', err);
  });
  socket.on('disconnect', (reason) => {
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
  const port = Number(ru.port || (ru.protocol === 'https:' ? 443 : 80))
  const pathName = ru.pathname

  const state = providedState || crypto.randomBytes(16).toString('base64url')
  const accountUrl = new UrlParser('https://chzzk.naver.com/account-interlock')
  accountUrl.searchParams.set('clientId', clientId)
  accountUrl.searchParams.set('redirectUri', redirectUri)
  accountUrl.searchParams.set('state', state)

  const app = express()
  const server = http.createServer(app)

  const wait = new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{ try{server.close()}catch{}; reject(new Error('timeout')) }, timeoutMs)
    app.get(pathName, (req, res)=>{
      const { code, state:returnedState } = req.query
      if(!code || !returnedState || returnedState !== state){
        res.status(400).send('invalid state/code')
        clearTimeout(timer); reject(new Error('invalid state/code')); return
      }
      res.status(200).send('OK. You can close this window.')
      clearTimeout(timer); resolve({ code:String(code), state:String(returnedState) })
      setTimeout(()=>{ try{server.close()}catch{} }, 50)
    })

    app.use((req, res, next) => {
        console.log(`[DEBUG] Incoming request path: ${req.path}`);
        console.log(`[DEBUG] Expected path: ${pathName}`);
        // 이 로그를 보고 두 경로가 다른지 확인!
        res.status(404).send(`Path mismatch. Received ${req.path} but expected ${pathName}`);
        try{server.close()}catch{}; 
        reject(new Error('Path mismatch'));
    });    
    
    server.listen(port, host, ()=>{
      if(openBrowser) open(accountUrl.toString())
    })
  })

  return await wait
}

async function getToken(authorizationCode, stateValue) {
  const tokenUrl = 'https://openapi.chzzk.naver.com/auth/v1/token';

  const clientId = process.env.CHZZK_CLIENT_ID;
  const clientSecret = process.env.CHZZK_CLIENT_SECRET; // .env 파일에 추가해야 합니다.

  if (!clientSecret) {
    throw new Error('missing CLIENT_SECRET');
  }

  // 요청 Body 구성
  const payload = {
    grantType: 'authorization_code',
    clientId: clientId,
    clientSecret: clientSecret,
    code: authorizationCode,
    state: stateValue,
  };

  try {
    // fetch API를 사용한 POST 요청
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // API 스펙에 따라 'application/x-www-form-urlencoded' 일 수도 있습니다.
      },
      body: JSON.stringify(payload),
    });

    const tokens = await response.json();

    if (!response.ok) {
      // API가 에러를 반환한 경우
      console.error('Failed to get token:', tokens);
      throw new Error(tokens.message || 'An unknown error occurred');
    }

    console.log('Successfully received tokens:', tokens);
    // { accessToken: '...', refreshToken: '...', tokenType: 'Bearer', expiresIn: ... }
    return tokens;

  } catch (error) {
    console.error('Error in getToken:', error);
    throw error;
  }
}


// --- 전체 실행 흐름 ---
async function main() {
  try {
    console.log('Step 1: Getting authorization code...');
    const { code, state } = await GetCode();
    console.log(`Step 1 Success! Code: ${code}`);

    console.log('\nStep 2: Exchanging code for access token...');
    const tokenInfo = await getToken(code, state);

    if (!tokenInfo || !tokenInfo.content.accessToken) {
        throw new Error('Failed to retrieve a valid access token.');
    }
    

    console.log(`Step 2 Success! Access Token: ${tokenInfo.content.accessToken}`);

    process.env.CHZZK_BEARER = tokenInfo.content.accessToken;

    console.log('\nStep 3: Starting Chzzk session...');
    await startChzzkSession();

  } catch (error) {
    console.error('\nAuthentication process failed:', error.message);
  }
}

main();


//startChzzkSession().catch(console.error);

