(async()=>{
  const B='https://backend-p.defterbeyan.gov.tr/rs';
  const TK=(()=>{for(const S of [sessionStorage,localStorage]){for(let i=0;i<S.length;i++){const v=S.getItem(S.key(i));if(v&&/^ey[\w-]+\.[\w-]+\./.test(v))return v;}}return'';})();
  const H={'Content-Type':'application/json; charset=utf-8'};if(TK)H.Token=TK;
  const r2=v=>Math.round(v*100)/100;
  const iso=t=>{const a=String(t).split('.');return a.length===3?a[2]+'-'+a[1]+'-'+a[0]+' 00:00:00':t;};
  let tmpl=null;try{tmpl=JSON.parse(localStorage.getItem('zTmpl'));}catch(e){}
  if(!tmpl||!tmpl.gelirBelgeTuruKodu){
    if(!window.__zc){window.__zc=1;
      const grab=body=>{try{const q=JSON.parse(body);if(q.gelirBelgeTuruKodu&&q.kayitlar&&q.kayitlar.length){localStorage.setItem('zTmpl',JSON.stringify(q));console.log('%c✅ Z ŞABLONU YAKALANDI - kodu TEKRAR çalıştır','color:#0f0;font-size:20px');}}catch(e){}};
      const of=window.fetch;window.fetch=function(u,o){const url=(u&&u.url)||u||'';const p=of.apply(this,arguments);if(/\/gelir\/(create|update)/.test(url)&&o&&o.body)p.then(()=>grab(o.body));return p;};
      const oo=XMLHttpRequest.prototype.open,os=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this._u=u;return oo.apply(this,arguments);};XMLHttpRequest.prototype.send=function(b){if(/\/gelir\/(create|update)/.test(this._u||'')&&b)this.addEventListener('load',()=>grab(b));return os.apply(this,arguments);};
    }
    alert('CASUS KURULDU.\n\n1) Sol menu > Gelir Listele > bir Z Raporu satirina tikla\n2) Acilan sayfada "Belgeyi Guncelle"ye bas (hicbir sey degistirme)\n3) Bu kodu TEKRAR yapistir/calistir -> gonderim baslar');
    return;
  }
  let paket=null;try{paket=JSON.parse(await navigator.clipboard.readText());}catch(e){}
  if(!paket||paket.tip!=='battal-zrapor-gonder'){const t=prompt('Panelden kopyaladigin Z paketini yapistir:');try{paket=JSON.parse(t);}catch(e){}}
  if(!paket||!paket.firmalar){alert('Gecerli paket yok - panelde "Z Raporlarini Panoya Kopyala"ya bas');return;}
  const norm=s=>(s||'').toString().toLocaleUpperCase('tr');
  const banner=document.querySelector('.dbs-navbar__content span');const aktif=banner?banner.innerText.split('\n')[0].trim():'';
  const firma=paket.firmalar.find(f=>norm(aktif).includes(norm(f.ad).slice(0,8))||norm(f.ad).includes(norm(aktif).slice(0,8)))||paket.firmalar[0];
  const kTmpl=tmpl.kayitlar[0];const kdvDahil=kTmpl.isKdvDahil!==false;
  const nakitKey=Object.keys(tmpl).find(k=>/nakit/i.test(k));const krediKey=Object.keys(tmpl).find(k=>/krediKarti/i.test(k))||'krediKartiTutari';
  let ok=0,f=0,atla=0;const hata=[];
  // MUKERRER KORUMASI: Z raporunda sunucu ayni Z No'yu reddetmiyor; onceden kayitli Z No'lari cekip atla
  const mevcut=new Set();
  try{const yil=new Date().getFullYear();const sr=await fetch(B+'/gelirliste/search',{method:'POST',headers:H,credentials:'include',body:JSON.stringify({attributes:{baslangicTarihi:yil+'-01-01 00:00:00',bitisTarihi:yil+'-12-31 23:59:59'},pagingContext:{page:1,limit:1000,orderContextMap:{'date(kayit_tarihi)':'DESC'}}})});const sj=await sr.json();((sj.resultContainer&&(sj.resultContainer.resultList||sj.resultContainer.list))||[]).forEach(r=>{if(r.belgeSiraNo!=null)mevcut.add(String(r.belgeSiraNo).trim());});}catch(e){}
  console.log('%c🚀 '+firma.ad+' - '+firma.belgeler.length+' Z gonderiliyor... (kayitli: '+mevcut.size+')','color:#7c3aed;font-size:16px');
  for(const b of firma.belgeler){
    if(mevcut.has(String(b.zno).trim())){atla++;console.log('⏭ Z '+b.zno+' zaten kayitli - atlandi');continue;}
    const t=iso(b.tarih);const P=JSON.parse(JSON.stringify(tmpl));P.kayitTarihi=t;P.belgeTarihi=t;P.belgeSiraNo=String(b.zno);let top=0;
    P.kayitlar=b.satirlar.map(s=>{const k=JSON.parse(JSON.stringify(kTmpl));const oran=s.oran||0;let m,kdv,dh;if(kdvDahil){dh=s.tutar;m=r2(dh/(1+oran/100));kdv=r2(dh-m);k.tutar=dh;}else{m=s.tutar;kdv=r2(m*oran/100);k.tutar=m;dh=r2(m+kdv);}k.kdvOrani=oran;if('kdv' in k)k.kdv=kdv;k.aciklama=s.aciklama;top+=dh;delete k.id;delete k.gelirBelgeId;delete k.key;return k;});
    P.belgeTutari=r2(top);P[krediKey]=r2(b.kredi);if(nakitKey)P[nakitKey]=r2(b.nakit);
    delete P.id;delete P.gelirBelgeId;delete P.key;
    try{const cr=await fetch(B+'/gelir/create',{method:'POST',headers:H,body:JSON.stringify(P),credentials:'include'});const cj=await cr.json();
      if(cr.status===200&&cj.resultContainer&&!cj.errorMessage){ok++;mevcut.add(String(b.zno).trim());console.log('✅ Z '+b.zno+' ('+top.toFixed(2)+')');}
      else{const m=(cj.errorMessage||cj.statusMessage||cr.status).toString();if(/aynı|mükerrer|zaten/i.test(m)){atla++;console.log('⏭ Z '+b.zno+' zaten var');}else{f++;hata.push(b.zno+': '+m);console.log('❌ Z '+b.zno+' - '+m);}}
    }catch(e){f++;hata.push(b.zno+': '+e.message);}
  }
  alert('🎉 '+firma.ad+' bitti\n✅ Yeni: '+ok+'\n⏭ Zaten kayitli (atlandi): '+atla+(f?'\n❌ Hata: '+f+'\n'+hata.slice(0,8).join('\n'):''));
})();
