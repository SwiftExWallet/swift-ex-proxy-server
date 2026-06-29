const axios = require('axios');
async function test() {
  const res = await axios.get('https://unpkg.com/@1inch/fusion-sdk@latest/dist/index.js');
  const code = res.data;
  const match = code.match(/wss?:\/\/[^'"]+/g);
  console.log(match ? Array.from(new Set(match)) : 'No websocket URL found');
}
test();
