'use strict';
// Project-photo input validation. No filenames are used as filesystem paths.
// The browser decodes and re-encodes uploads. Server checks encoded size,
// allowed raster headers/dimensions and PNG checksums independently of MIME.
const crypto = require('node:crypto');
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 100 * 1024;
function fail(code, message) { throw Object.assign(new Error(message), {code, status:400}); }
function check(ok, message) { if (!ok) fail('INVALID_IMAGE', message || 'ملف الصورة غير صالح. اختر PNG أو JPG أو WebP حقيقية.'); }
function crc32(buf) {
 let c=0xffffffff;
 for(const v of buf){c^=v;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):(c>>>1);}
 return (c^0xffffffff)>>>0;
}
function dimensions(buf, mime) {
 if(mime==='image/png') {
  check(buf.length>=45 && buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  let at=8,w=0,h=0,hasData=false,ended=false;
  while(at+12<=buf.length){
   const n=buf.readUInt32BE(at),end=at+12+n;check(end<=buf.length);
   const type=buf.toString('ascii',at+4,at+8);
   check(crc32(buf.subarray(at+4,at+8+n))===buf.readUInt32BE(at+8+n));
   if(at===8){check(type==='IHDR'&&n===13);w=buf.readUInt32BE(at+8);h=buf.readUInt32BE(at+12);}
   else check(type!=='IHDR');
   if(type==='IDAT')hasData=true;
   if(type==='IEND'){check(n===0&&hasData&&end===buf.length);ended=true;break;}
   at=end;
  }
  check(ended);return {width:w,height:h};
 }
 if(mime==='image/jpeg'){
  check(buf.length>=20 && buf[0]===0xff && buf[1]===0xd8 && buf[buf.length-2]===0xff && buf[buf.length-1]===0xd9);
  let at=2,w=0,h=0,hasScan=false;
  while(at<buf.length-2){
   check(buf[at]===0xff);while(buf[at]===0xff)at++;const marker=buf[at++];
   if(marker===0xda){hasScan=true;break;}
   if(marker===0xd9)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   check(at+2<=buf.length);const n=buf.readUInt16BE(at);check(n>=2&&at+n<=buf.length);
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    check(n>=8);h=buf.readUInt16BE(at+3);w=buf.readUInt16BE(at+5);
   }
   at+=n;
  }
  check(w>0&&h>0&&hasScan);return {width:w,height:h};
 }
 if(mime==='image/webp'){
  check(buf.length>=20 && buf.toString('ascii',0,4)==='RIFF' && buf.toString('ascii',8,12)==='WEBP' && buf.readUInt32LE(4)+8===buf.length);
  let at=12,w=0,h=0,hasRaster=false;
  while(at+8<=buf.length){
   const type=buf.toString('ascii',at,at+4),n=buf.readUInt32LE(at+4),p=at+8,end=p+n;check(end<=buf.length);
   if(type==='VP8X'){check(n>=10);w=1+buf.readUIntLE(p+4,3);h=1+buf.readUIntLE(p+7,3);}
   if(type==='VP8 '){check(n>=10 && buf[p+3]===0x9d&&buf[p+4]===1&&buf[p+5]===0x2a);w=buf.readUInt16LE(p+6)&0x3fff;h=buf.readUInt16LE(p+8)&0x3fff;hasRaster=true;}
   if(type==='VP8L'){check(n>=5&&buf[p]===0x2f);const bits=buf.readUInt32LE(p+1);w=1+(bits&0x3fff);h=1+((bits>>>14)&0x3fff);hasRaster=true;}
   // Normalized upload is a static preview, not an animated image.
   check(type!=='ANIM'&&type!=='ANMF','اختر صورة ثابتة وليست متحركة.');
   at=end+(n&1);
  }
  check(at===buf.length&&hasRaster&&w>0&&h>0);return {width:w,height:h};
 }
 fail('INVALID_IMAGE','الصيغ المتاحة: PNG وJPG وWebP.');
}
function validateDataURL(src, thumbnail=false) {
 const max=thumbnail?MAX_THUMB_BYTES:MAX_IMAGE_BYTES;
 check(typeof src==='string');
 if(src.length>Math.ceil(max/3)*4+80)fail('IMAGE_TOO_LARGE',thumbnail?'الصورة المصغرة أكبر من الحد المسموح.':'الصورة المحفوظة أكبر من 3 MB. اختر صورة أصغر.');
 const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);check(m);
 const bytes=Buffer.from(m[2],'base64');check(bytes.length>0 && bytes.toString('base64')===m[2]);
 if(bytes.length>max)fail('IMAGE_TOO_LARGE','حجم الصورة أكبر من الحد المسموح.');
 const size=dimensions(bytes,m[1]),edge=thumbnail?256:4096;
 check(size.width>0&&size.height>0&&size.width<=edge&&size.height<=edge&&size.width*size.height<=(thumbnail?65536:16e6),'أبعاد الصورة غير مناسبة. أعد اختيارها من زر رفع الصورة لتجهيزها تلقائيًا.');
 return {mime:m[1],...size,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const imageToken=im=>crypto.createHash('sha256').update(JSON.stringify(im||null)).digest('hex');
function safeFilename(name){return typeof name==='string'?name.replace(/.*[\\/]/,'').replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'').slice(0,120):'';}
module.exports={validateDataURL,imageToken,safeFilename,MAX_IMAGE_BYTES,MAX_THUMB_BYTES};
