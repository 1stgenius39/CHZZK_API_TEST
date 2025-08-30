// @ts-nocheck
import 'dotenv/config'
import fetch from 'node-fetch';
import io from 'socket.io-client';
const BEARER_TOKEN = process.env.CHZZK_BEARER;
async function startChzzkSession() { 
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
        if(content.contains("쯔모"))
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



startChzzkSession().catch(console.error);