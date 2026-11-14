const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../src/core/stats.js');
const B = require('../src/analysis/bootstrap.js');
const near = (a,b,t=1e-8) => assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);
const ctx = {window:{PTSL:{}}};
vm.runInNewContext(fs.readFileSync('src/data/csv-parser.js','utf8'),ctx);
function fixture(file) {
  const rows = ctx.window.PTSL.parseCSV(fs.readFileSync(file,'utf8'));
  const headers=rows.shift(), data={}, groups={};
  headers.forEach((h,i)=>{ if (/^(TC|CL|HL|TT|DSD|NTR|RR|YD)\d+$/.test(h)) {
    data[h]=rows.map(r=>Number(r[i]));
    const name=h.replace(/\d+$/,''); (groups[name]??=[]).push(h);
  }});
  const blocks=Object.entries(groups).map(([name,items])=>({name,items}));
  const paths=[['TC','HL'],['CL','HL'],['HL','TT'],['CL','YD'],['DSD','YD'],['NTR','YD'],['RR','YD']].filter(p=>p.every(n=>groups[n]));
  return {data,blocks,paths};
}
for (const file of ['du_lieu_mau.csv','du_lieu_thu_nghiem.csv','data_test.csv','data_test_kho.csv']) {
  test(`raw-data and correlation engines agree: ${file}`,()=>{
    const {data,blocks,paths}=fixture(file); assert.ok(blocks.length>=2);
    for(const scheme of ['path','factor']) {
      const a=S.plsAlgorithm(data,blocks,paths,{scheme});
      const b=B.plsCorr(S.corMatrix(blocks.flatMap(b=>b.items.map(i=>data[i]))),blocks,paths,{scheme});
      assert.ok(a.converged && b.converged);
      a.loadings.forEach((ls,j)=>ls.forEach((v,k)=>near(v,b.loadings[j][k])));
      a.weights.forEach((ws,j)=>ws.forEach((v,k)=>near(v,b.weights[j][k])));
      a.structural.forEach((s,j)=>{if(s){near(s.r2,b.structural[j].r2);s.beta.forEach((v,k)=>near(v,b.structural[j].beta[k]));}});
      a.quality.forEach((q,j)=>{
        const ls=a.loadings[j]; near(q.ave,ls.reduce((s,l)=>s+l*l,0)/ls.length);
        const sum=ls.reduce((s,l)=>s+l,0); near(q.rhoC,sum*sum/(sum*sum+ls.reduce((s,l)=>s+1-l*l,0)));
      });
    }
  });
}
test('known two-indicator alpha and standardized OLS',()=>{
  const x=[-1,-1,1,1], z=[-1,1,-1,1], y=x.map((v,i)=>0.6*v+0.8*z[i]);
  near(S.cronbachAlphaStd([x,y]),0.75);
  const fit=S.stdRegression(y,[x,z]);near(fit.beta[0],0.6);near(fit.beta[1],0.8);near(fit.r2,1);
  near(S.vifFromCols([x,z])[0],1);
});
test('bootstrap orientation follows original loadings',()=>{
  const r={loadings:[[.8,.9],[.7,.8]],weights:[[.5,.5],[.5,.5]],structural:[null,{predictors:[0],beta:[.4]}]};
  B.fixSigns(r,{loadings:[[-.8,-.9],[.7,.8]]});
  near(r.loadings[0][0],-.8);near(r.structural[1].beta[0],-.4);
});
test('bootstrap reproducible and cancellable, rejects unconverged model',async()=>{
  const f=fixture('du_lieu_mau.csv'); const original=S.plsAlgorithm(f.data,f.blocks,f.paths,{scheme:'path'});
  const context={...f,original,plsOpts:{scheme:'path'}}, opts={samples:30,seed:0,tails:2,alpha:.05};
  const a=await B.run(context,opts),b=await B.run(context,opts);
  assert.deepEqual(a.stats,b.stats); assert.equal(a.done,30);
  await assert.rejects(B.run(context,opts,null,()=>true),/hủy/);
  await assert.rejects(B.run({...context,original:{...original,converged:false}},opts),/chưa hội tụ/);
});


test('row influence: planted outlier is found, shares sum to 1, zero-count subset is consistent',async()=>{
  const f=fixture('du_lieu_mau.csv');
  const data=Object.fromEntries(Object.entries(f.data).map(([k,v])=>[k,v.slice()]));
  // Dòng 0: đảo ngược quan hệ TC → HL (TC cực cao, HL cực thấp)
  const lo=Math.min(...data.HL1), hi=Math.max(...data.TC1);
  f.blocks.find(b=>b.name==='TC').items.forEach(it=>{data[it][0]=hi;});
  f.blocks.find(b=>b.name==='HL').items.forEach(it=>{data[it][0]=lo;});
  const original=S.plsAlgorithm(data,f.blocks,f.paths,{scheme:'path'});
  const n=data.HL1.length;
  const r=await B.run({data,blocks:f.blocks,paths:f.paths,original,plsOpts:{scheme:'path'},rowIds:Array.from({length:n},(_,i)=>i+10)},{samples:400,seed:3,tails:2,alpha:.05});
  const inf=r.influence; assert.equal(inf.n,n); assert.equal(r.rowIds[0],10);
  const id='paths|TC → HL';
  let sum=0; inf.rows.forEach(x=>{sum+=x.effects[id].share;}); near(sum,1,1e-9);
  const e=inf.rows[0].effects[id];
  assert.ok(e.share>inf.cut && inf.rows[0].influential, `share ${e.share}`);
  assert.ok(e.d>0 && e.corr<0, 'removing the row raises the coefficient; more copies lower it');
  // Ước lượng khi bỏ dòng khớp với chạy lại PLS trên dữ liệu thiếu dòng đó
  const d1=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.slice(1)]));
  const re=S.plsAlgorithm(d1,f.blocks,f.paths,{scheme:'path'});
  const j=f.blocks.findIndex(b=>b.name==='HL'), k=re.structural[j].predictors.findIndex(p=>f.blocks[p].name==='TC');
  near(e.est,re.structural[j].beta[k],1e-6);
  assert.ok(e.n0>100 && e.n0<200 && e.se>0, `n0 ${e.n0}`);   // ≈ 36,8% của 400
  assert.equal(inf.keys.find(x=>x.key==='TC → HL').top,0);
});

test('HTMT with a single-item construct uses monotrait mean 1 in both engines',()=>{
  const f=fixture('du_lieu_mau.csv');
  const blocks=f.blocks.map(b=>b.name==='TT'?{name:'TT',items:[b.items[0]]}:b);
  const a=S.plsAlgorithm(f.data,blocks,f.paths,{scheme:'path'});
  const cols=blocks.flatMap(b=>b.items.map(i=>f.data[i]));
  const b=B.plsCorr(S.corMatrix(cols),blocks,f.paths,{scheme:'path'});
  const iT=blocks.findIndex(x=>x.name==='TT'), iH=blocks.findIndex(x=>x.name==='HL'), hl=blocks[iH].items;
  let het=0; hl.forEach(it=>{het+=Math.abs(S.cor(f.data[it],f.data[blocks[iT].items[0]]));}); het/=hl.length;
  let mono=0,m=0; for(let x=0;x<hl.length;x++)for(let y=x+1;y<hl.length;y++){mono+=Math.abs(S.cor(f.data[hl[x]],f.data[hl[y]]));m++;}
  const ref=het/Math.sqrt(mono/m*1);
  near(a.htmt[iT][iH],ref); near(b.htmt[iT][iH],ref); near(a.htmt[iH][iT],ref);
  assert.ok(Number.isNaN(a.htmt[iT][iT]));
});
