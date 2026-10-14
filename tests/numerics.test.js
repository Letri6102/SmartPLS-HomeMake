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

