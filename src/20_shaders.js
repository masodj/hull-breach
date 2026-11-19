// ---------- WGSL ----------
const WG_COMMON = /*wgsl*/`
struct G{vp:mat4x4f,vpn:mat4x4f,pvp:mat4x4f,cam:vec4f,right:vec4f,up:vec4f,fwd:vec4f,res:vec4f,jit:vec4f,sun:vec4f,prj:vec4f,hud0:vec4f,hud1:vec4f,hud2:vec4f,misc:vec4f,dyn:array<vec4f,16>,fogl:array<vec4f,48>,blob:array<vec4f,16>};
@group(0)@binding(0)var<uniform>g:G;
fn h21(p:vec2f)->f32{var q=fract(vec3f(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
fn h31(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.zyx+31.32);return fract((q.x+q.y)*q.z);}
fn n2(p:vec2f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2f(1.,0.)),u.x),mix(h21(i+vec2f(0.,1.)),h21(i+vec2f(1.,1.)),u.x),u.y);}
fn n3(p:vec3f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);
return mix(mix(mix(h31(i),h31(i+vec3f(1.,0.,0.)),u.x),mix(h31(i+vec3f(0.,1.,0.)),h31(i+vec3f(1.,1.,0.)),u.x),u.y),mix(mix(h31(i+vec3f(0.,0.,1.)),h31(i+vec3f(1.,0.,1.)),u.x),mix(h31(i+vec3f(0.,1.,1.)),h31(i+vec3f(1.,1.,1.)),u.x),u.y),u.z);}
fn fbm3(p:vec3f)->f32{return .5*n3(p)+.25*n3(p*2.03+7.1)+.125*n3(p*4.01+3.3)+.0625*n3(p*8.07+1.7);}
`;
const WG_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{return vec4f(f32(i&1u)*4.-1.,f32(i>>1u)*4.-1.,0.,1.);}
`;

// ----- depth pre-pass + G-buffer -----
const WG_GBUF = WG_COMMON + /*wgsl*/`
struct Inst{a0:vec4f,a1:vec4f,a2:vec4f,a3:vec4f,b0:vec4f,b1:vec4f,b2:vec4f,b3:vec4f,col:vec4f};
@group(0)@binding(1)var<storage,read>insts:array<Inst>;
struct VIn{@location(0)pos:vec3f,@location(1)nrm:vec3f,@location(2)col:vec4f,@location(3)mat:vec4u};
struct VOut{@builtin(position)@invariant cp:vec4f,@location(0)wp:vec3f,@location(1)wn:vec3f,@location(2)lp:vec3f,@location(3)ln:vec3f,@location(4)col:vec4f,@location(5)glow:vec4f,@location(6)cc:vec4f,@location(7)pc:vec4f,@location(8)@interpolate(flat)mat:u32};
struct X{p:vec3f,n:vec3f,wp:vec3f};
fn xf(v:VIn,ii:u32)->X{
  let I=insts[ii];var p=v.pos;var n=v.nrm;let sh=I.a0.w;
  if(sh>.5){
    if(sh>3.5){let a=abs(p);let q=a*a*a;n=normalize(sign(p)*q*a*a);p=p/pow(dot(q,q),1./6.);}
    else if(sh>2.5){let r=max(abs(p.x),abs(p.z));let l=length(p.xz);if(l>1e-5){let q=p.xz*(r/l);p=vec3f(q.x,p.y,q.y);}if(abs(v.nrm.y)<.5){n=normalize(vec3f(p.x,0.,p.z));}}
    else if(sh>1.5){n=normalize(p);p=n;}
    let tp=mix(1.,I.a1.w,p.y*.5+.5);p=vec3f(p.x*tp,p.y,p.z*tp);
  }
  var o:X;o.p=p;o.n=n;o.wp=I.a0.xyz*p.x+I.a1.xyz*p.y+I.a2.xyz*p.z+I.a3.xyz;return o;
}
@vertex fn vsz(v:VIn,@builtin(instance_index)ii:u32)->@builtin(position)@invariant vec4f{let x=xf(v,ii);return g.vp*vec4f(x.wp,1.);}
@vertex fn vs(v:VIn,@builtin(instance_index)ii:u32)->VOut{
  let x=xf(v,ii);let I=insts[ii];var o:VOut;
  let c0=I.a0.xyz;let c1=I.a1.xyz;let c2=I.a2.xyz;
  o.cp=g.vp*vec4f(x.wp,1.);o.wp=x.wp;
  o.wn=cross(c1,c2)*x.n.x+cross(c2,c0)*x.n.y+cross(c0,c1)*x.n.z;
  o.lp=x.p*vec3f(length(c0),length(c1),length(c2));o.ln=x.n;
  o.col=vec4f(v.col.rgb*I.col.rgb,v.col.a*32.*I.a3.w);
  o.glow=vec4f(I.b0.w,I.b1.w,I.b2.w,I.col.a);
  o.cc=g.vpn*vec4f(x.wp,1.);
  o.pc=g.pvp*vec4f(I.b0.xyz*x.p.x+I.b1.xyz*x.p.y+I.b2.xyz*x.p.z+I.b3.xyz,1.);
  o.mat=v.mat.x+u32(I.a2.w+.5);
  return o;
}
// box-filtered line of half width w at distance d, filter footprint fw
fn lnf(d:f32,w:f32,fw:f32)->f32{return clamp((w-d)/fw+.5,0.,1.)-clamp((-w-d)/fw+.5,0.,1.);}
// procedural surface pattern: (height, feature a, feature b, id hash)
fn pat(m:u32,uv:vec2f,fw:f32)->vec4f{
  var r=vec4f(0.);
  if(m==1u){
    var t=uv*vec2f(.5,1.);let row=floor(t.y);t.x+=.5*(row-2.*floor(row*.5));
    let id=floor(t);let f=fract(t);
    let d=min(min(f.x,1.-f.x)*2.,min(f.y,1.-f.y));
    let gr=lnf(d,.007,fw);let th=h21(id+.5);
    var h=-gr*.004;var sl=0.;
    if(th<.16){
      let sd=abs(fract(f.x*25.)-.5)*.08;
      sl=lnf(sd,.018,fw)*smoothstep(.1,.13,d);h-=sl*.012;
    }
    r=vec4f(h,gr,sl,th);
  }else if(m==2u){
    var t=vec2f(uv.x*.5,(uv.y-.25)/1.25);
    let id=floor(t);let f=fract(t);
    let c=vec2f(min(f.x,1.-f.x)*2.,min(f.y,1.-f.y)*1.25);let d=min(c.x,c.y);
    let gr=lnf(d,.006,fw);let bev=smoothstep(0.,.035,d-.006);
    let rv=clamp((.016-length(c-vec2f(.09)))/max(fw,.004)+.5,0.,1.)*clamp(1.-fw*20.,0.,1.);
    let th=h21(id+.5);let sub=step(.3,th)*step(th,.62)*max(lnf(abs(f.x-.5)*2.,.004,fw),lnf(abs(f.y-select(.5,.33,th>.46))*1.25,.004,fw));let rib=step(.72,th)*smoothstep(.1,.16,d)*(.5+.5*sin(uv.y*78.))*clamp(1.-fw*70.,0.,1.);
    r=vec4f(bev*.004-gr*.003+rv*.003+rib*.0025-sub*.0025,max(gr,sub*.7),rv,th);
  }else if(m==3u){
    let f=fract(uv);let d=min(min(f.x,1.-f.x),min(f.y,1.-f.y));let gr=lnf(d,.012,fw);
    r=vec4f(-gr*.006,gr,0.,h21(floor(uv)+.5));
  }else if(m==12u){
    let s=abs(fract(uv.x*9.)-.5)*2.;let k=smoothstep(.25,.75,s);
    r=vec4f(k*.007*clamp(1.-fw*22.,0.,1.),k,0.,0.);
  }
  return r;
}
struct FOut{@location(0)alb:vec4f,@location(1)nr:vec4f,@location(2)em:vec4f,@location(3)vel:vec4f};
@fragment fn fs(i:VOut)->FOut{
  let Ng=normalize(i.wn);let m=i.mat;let an=abs(i.ln);
  var uv:vec2f;var T:vec3f;var B:vec3f;
  if(an.y>=an.x&&an.y>=an.z){uv=i.lp.xz;T=vec3f(1.,0.,0.);B=vec3f(0.,0.,1.);}
  else if(an.x>=an.z){uv=i.lp.zy;T=vec3f(0.,0.,1.);B=vec3f(0.,1.,0.);}
  else{uv=i.lp.xy;T=vec3f(1.,0.,0.);B=vec3f(0.,1.,0.);}
  let dwx=dpdx(i.wp);let dwy=dpdy(i.wp);
  // footprint from world position derivatives (continuous across projection switches)
  let fw=max(max(length(dwx),length(dwy)),1e-4);
  let dnx=dpdx(Ng);let dny=dpdy(Ng);
  let t=g.cam.w;let c=i.col.rgb;let es=i.col.a;
  var N=Ng;var alb=c;var ro=.5;var me=0.;var em=vec3f(0.);
  var hv=0.;
  let P=pat(m,uv,fw);
  if(m==1u||m==2u||m==3u||m==12u){
    let e=max(fw,.0015);
    let hu=(pat(m,uv+vec2f(e,0.),fw).x-P.x)/e;let hw=(pat(m,uv+vec2f(0.,e),fw).x-P.x)/e;
    N=normalize(Ng-(T*hu+B*hw)*(1.6*clamp(1.25-fw*select(12.,70.,m==1u),0.,1.)));
  }
  let nl=n2(uv*.55);let nm=n2(uv*1.7+11.)*clamp(1.-fw*1.5,0.,1.);
  if(m==1u){
    let th=P.w;let wear=clamp(.6*nl+.4*nm,0.,1.);
    alb=vec3f(.27,.285,.31)*(.7+.5*th)*(1.-.75*P.y)*(.8+.4*wear);
    ro=clamp(.14+.3*smoothstep(.35,.75,nl)+.04*th,.15,.44);me=.85;
    if(th<.16){alb=mix(alb,vec3f(.01),P.z);ro=mix(ro,.7,smoothstep(.1,.13,min(min(fract(uv.x*.5+.25*(floor(uv.y)-2.*floor(uv.y*.5))),1.-fract(uv.x*.5+.25*(floor(uv.y)-2.*floor(uv.y*.5))))*2.,min(fract(uv.y),1.-fract(uv.y)))));em=c*P.z*.07*(.6+.4*sin(t*1.3+th*90.));}
    let stain=smoothstep(.55,.85,n2(uv*.23+40.));alb*=1.-.3*stain;
  }else if(m==2u){
    let th=P.w;
    alb=c*(.88+.2*th)*(1.-.7*P.y)*(.82+.3*nl)*select(1.,.8,th<.2);
    let stripe=lnf(abs(uv.y-1.42),.05,fw);
    alb=mix(alb,vec3f(.75,.42,.08),stripe*.8*step(.55,th));
    alb=mix(alb,vec3f(.62,.64,.68),P.z);
    let gri=smoothstep(1.3,0.,uv.y)*(.35+.4*nm);alb*=1.-gri*.6;
    
    ro=clamp(.4+.25*nl+.2*gri-.1*th,.25,.85);me=.55;
    let wt2=vec2f(uv.x*.5,(uv.y-.25)/1.25);let wid=floor(wt2);let wf=fract(wt2);let wc0=vec2f(min(wf.x,1.-wf.x)*2.,min(wf.y,1.-wf.y)*1.25);let dh=h21(wid+7.3);let dfade=clamp(1.-fw*25.,0.,1.);
    let rr=vec2f(abs(fract(uv.x*4.)-.5)*.25,abs(wc0.y-.05));let rv2=clamp((.011-length(rr))/max(fw,.003)+.5,0.,1.)*clamp(1.-fw*30.,0.,1.)*step(.5,dh);alb=mix(alb,vec3f(.5,.52,.55),rv2*.7);
    let sc2=smoothstep(.8,.95,n2(vec2f(uv.x*18.+wid.y*7.,uv.y*260.)))*clamp(1.-fw*220.,0.,1.);
    let dv=fract(dh*37.);
    if(dh>.8&&wid.y<1.5&&dv<.35){
      let gx=(wf.x-.1)*50.;let gy=(wf.y-.6)*14.;
      let on=step(0.,gx)*step(gx,6.+floor(dh*60.)%14.)*step(0.,gy)*step(gy,1.)*step(.3,h21(vec2f(floor(gx),wid.x+wid.y*31.)))*step(.2,fract(gx))*step(.15,fract(gy));
      let on2=step(0.,gx)*step(gx,3.)*step(-1.6,gy)*step(gy,-.3)*step(.15,fract(gx));
      alb=mix(alb,vec3f(.62,.64,.66),max(on,on2*.8)*.75*dfade);
    }else if(dh>.8&&wid.y<1.5&&dv<.6){
      // chevron band
      let q=vec2f((wf.x-.12)*2.,(wf.y-.2)*1.25);let cv=abs(fract((q.x-abs(q.y-.06))*9.)-.5);
      let on=step(0.,q.x)*step(q.x,.55)*step(0.,q.y)*step(q.y,.12)*clamp((.25-cv)/max(fw*9.,.02)+.5,0.,1.);
      alb=mix(alb,select(vec3f(.7,.45,.06),vec3f(.6,.62,.65),dv<.48),on*.7*dfade);
    }else if(dh>.8&&wid.y<1.5&&dv<.8){
      // deck ring marker
      let q=(wf-vec2f(.78,.7))*vec2f(2.,1.25);let rd=length(q);
      let on=max(lnf(abs(rd-.1),.012,max(fw,.002)),lnf(abs(q.y),.012,max(fw,.002))*step(rd,.1));
      alb=mix(alb,vec3f(.62,.64,.66),on*.75*dfade);
    }else if(dh>.8&&wid.y<1.5){
      // large bay bars
      let q=vec2f((wf.x-.1)*2.,(wf.y-.55)*1.25);
      let on=step(0.,q.x)*step(q.x,.5)*step(0.,q.y)*step(q.y,.22)*step(.25,fract(q.x*8.))*step(fract(q.x*8.+.5*floor(q.y*9.)),.9)*step(.3,fract(q.y*4.5))*step(.4,h21(vec2f(floor(q.x*8.),wid.x*3.+wid.y)));
      alb=mix(alb,vec3f(.6,.62,.65),on*.7*dfade);
    }
    if(dh<.12&&wid.y<.5){let q=(wf-vec2f(.5,.55))*vec2f(2.,1.25);let tri=max(abs(q.x)*1.73+q.y,-q.y)-.14;let trm=clamp(-tri/max(fw,.002)+.5,0.,1.);let tin=clamp((-tri-.035)/max(fw,.002)+.5,0.,1.);alb=mix(alb,mix(vec3f(.02),vec3f(.8,.55,.05),tin),trm*.85*dfade);}
    let wc2=vec2f(min(wf.x,1.-wf.x)*2.,min(wf.y,1.-wf.y)*1.25);let ew=smoothstep(.05,.012,min(wc2.x,wc2.y))*smoothstep(.35,.7,n2(uv*9.)+.3*nm)*clamp(1.-fw*30.,0.,1.);alb=mix(alb,vec3f(.42,.44,.47),ew*.45);ro=mix(ro,.3,ew*.5);
  }else if(m==3u){
    alb=vec3f(.1,.105,.115)*(.7+.6*P.w)*(1.-.6*P.y);ro=.62;me=.6;
  }else if(m==4u){
    alb=c*(.85+.3*nl);ro=.36+.2*nm;me=.9;
  }else if(m==5u){
    let s=abs(fract((i.lp.x+i.lp.y+i.lp.z)*2.2)-.5)*.4545;let k=clamp((s-.1136)/max(fw,1e-3)+.5,0.,1.);
    alb=mix(vec3f(.03),vec3f(.78,.52,.04),k)*(.7+.4*nl);ro=.55;me=.25;
  }else if(m==6u){
    alb=vec3f(0.);em=c*es;ro=.4;
  }else if(m==7u){
    alb=c*(.8+.4*nl);ro=.28+.25*nm;me=1.;
  }else if(m==8u){
    let sv=h21(floor(i.wp.xz*.25)+3.7);let fade=clamp(1.-fw*30.,0.,1.);var pt=0.;
    if(sv<.4){
      let q=uv*vec2f(14.,22.);let row=floor(q.y);let hr=h21(vec2f(row,7.));
      let x=q.x*.35+t*(hr-.5)*.8;let cell=h21(vec2f(floor(x*3.),row));
      pt=step(.45,cell)*step(.25,fract(q.y))*step(fract(q.y),.8)*(.5+.5*hr);
    }else if(sv<.75){
      let y=sin(uv.x*9.+t*2.)*sin(uv.x*3.7-t*.7)*.22;let yy=fract(uv.y*1.4)-.5;
      pt=lnf(abs(yy-y),.012,max(fw,.004))+.25*lnf(abs(fract(uv.x*5.)-.5)*.2,.004,max(fw,.004))+.25*lnf(abs(fract(uv.y*7.)-.5)*.143,.004,max(fw,.004));
    }else{
      let c=fract(uv*vec2f(1.,1.3))-.5;let r=length(c);let a=atan2(c.y,c.x);
      pt=lnf(abs(fract(r*9.)-.5)*.111,.004,max(fw,.004))*.5+pow(fract((a-t*1.5)*.15915),6.)*step(r,.45)+step(.985,h21(floor(c*40.)+floor(t*.5)))*2.;
    }
    alb=vec3f(.01);ro=.2;me=0.;
    em=c*es*(.1+mix(.3,pt,fade))*(.92+.08*sin(t*40.+uv.y*30.));
  }else if(m==9u){
    let s=abs(fract(uv.y*14.)-.5)/14.;let k=lnf(s,.016,fw);
    alb=mix(c,vec3f(.01),k*.9);ro=.45;me=.8;
  }else if(m==10u||m==11u){
    let q=abs(uv);let bd=.4-max(q.x,q.y);let fr=1.-smoothstep(.07,.085,bd);
    let hl=m==11u;let kc=select(vec3f(1.,.5,.06),vec3f(.1,1.,.4),hl);
    let base=select(vec3f(.13,.15,.1),vec3f(.62,.64,.66),hl);
    alb=mix(base,vec3f(.05,.055,.065),fr);ro=mix(.5,.35,fr);me=mix(.2,1.,fr);
    var sy=0.;
    if(hl){sy=max(step(q.x,.06)*step(q.y,.19),step(q.y,.06)*step(q.x,.19));}
    else{let bx=abs(abs(uv.x)-.11);sy=(step(bx,.035)+step(q.x,.035))*step(-.17,uv.y)*step(uv.y,.06+.09*(1.-smoothstep(0.,.035,min(bx,q.x))));}
    em=kc*sy*(6.+2.5*sin(t*4.))+kc*smoothstep(.02,0.,abs(bd-.045))*3.;
    alb=mix(alb,vec3f(0.),sy);
  }else if(m==12u){
    let chip=smoothstep(.68,.8,n2(uv*17.)*.5+n2(uv*4.)*.35+nl*.25)*clamp(1.-fw*14.,0.,1.);
    alb=mix(c*(.75+.35*nl),vec3f(.17,.1,.06),chip*.8);ro=mix(.5,.75,chip);me=mix(.25,.05,chip);
    let band=lnf(abs(uv.y-.68),.06,fw);alb=mix(alb,vec3f(.7,.7,.66),band*.8*(1.-chip));
    alb*=.6+.4*smoothstep(0.,.5,uv.y);
  }else if(m==13u||m==14u||m==18u){
    let q=i.lp*select(5.,2.4,m==13u);
    let f=fbm3(q)*.7+.3*n3(q*5.3);let ve=abs(n3(q*.7+vec3f(0.,t*.12,0.))-.5)*2.;
    let vw=select(.035,.045,m==13u);let vein=(1.-smoothstep(vw*.25,vw,ve))+.13*(1.-smoothstep(vw,vw*3.,ve));
    hv=f*select(.06,.16,m==13u)-vein*.03;
    if(m==13u){
      alb=mix(vec3f(.035,.015,.035),vec3f(.13,.04,.06),f);ro=.16+.3*f;me=0.;
      em=c*vein*es*(.5+.5*sin(t*1.7+q.y*2.))*.5;
    }else if(m==14u){
      alb=c*(.55+.9*f);ro=.26+.3*f;me=.25;
      let rim=pow(1.-max(dot(Ng,normalize(g.cam.xyz-i.wp)),0.),3.);
      em=i.glow.rgb*(vein*(.55+.45*sin(t*5.+q.y*3.))*es+rim*.085)+vec3f(4.,3.,2.5)*i.glow.a;
    }else{
      let fl=fbm3(vec3f(i.lp.x*2.,i.lp.y*1.2-t*1.6,i.lp.z*2.));
      alb=vec3f(0.);em=c*es*(.35+1.3*fl*fl)+vec3f(1.)*es*pow(fl,6.)*2.;hv=0.;
    }
  }else if(m==16u){
    let w3=n3(i.lp*900.);let wear=smoothstep(.3,.9,n3(i.lp*60.))*.12;let mg=lnf(abs(fract(i.lp.z*55.)-.5)/55.,.00035,max(fw,.0002))*(1.-i.glow.x);
    let rb=i.glow.x*(.5+.5*sin(dot(i.lp,vec3f(0.,0.,1.))*900.));
    alb=mix(c*(.94+.12*w3),vec3f(.42,.43,.45),wear*(1.-i.glow.x))*(1.-.5*rb)*(1.-.6*mg);ro=mix(.45,.3,wear)+.25*i.glow.x;me=mix(.9,.15,i.glow.x);
    em=(alb*.05+vec3f(.035,.05,.065)*pow(1.-max(dot(Ng,normalize(g.cam.xyz-i.wp)),0.),2.))*.6;
  }
  // screen-space bump for organic materials
  let dhx=dpdx(hv);let dhy=dpdy(hv);
  if(m==13u||m==14u){
    let r1=cross(dwy,Ng);let r2=cross(Ng,dwx);let det=dot(dwx,r1);
    let gr=sign(det)*(dhx*r1+dhy*r2);
    N=normalize(abs(det)*Ng-gr);
  }
  // geometric specular anti-aliasing
  let va=min(2.*max(dot(dnx,dnx),dot(dny,dny)),.18);
  ro=sqrt(sqrt(clamp(ro*ro*ro*ro+va,0.,1.)));
  var o:FOut;
  o.alb=vec4f(alb,me);o.nr=vec4f(N,ro);o.em=vec4f(em,1.);
  o.vel=vec4f((i.cc.xy/i.cc.w-i.pc.xy/i.pc.w)*vec2f(.5,-.5),0.,0.);
  return o;
}
`;

// ----- deferred lighting -----
const WG_LIGHT = WG_COMMON + WG_FS + /*wgsl*/`
struct Light{p:vec4f,c:vec4f};
@group(1)@binding(0)var tA:texture_2d<f32>;
@group(1)@binding(1)var tN:texture_2d<f32>;
@group(1)@binding(2)var tE:texture_2d<f32>;
@group(1)@binding(3)var tD:texture_depth_2d;
@group(1)@binding(4)var tH:texture_2d<f32>;
@group(1)@binding(5)var smp:sampler;
@group(1)@binding(6)var tS:texture_2d<f32>;
@group(1)@binding(7)var<storage,read>lights:array<Light>;
@group(1)@binding(8)var<storage,read>cells:array<u32>;
const SUNC=vec3f(1.,.93,.82);
fn ign(p:vec2f)->f32{return fract(52.9829189*fract(dot(p,vec2f(.06711056,.00583715))));}
fn ray(uv:vec2f)->vec3f{let n=vec2f(uv.x*2.-1.,1.-uv.y*2.)-g.jit.xy;return g.fwd.xyz+g.right.xyz*n.x+g.up.xyz*n.y;}
fn posAt(px:vec2i)->vec3f{let d=textureLoad(tD,px,0);return g.cam.xyz+ray((vec2f(px)+.5)*g.res.zw)*(g.prj.z/max(d,1e-7));}
fn sdf(p:vec2f)->f32{return textureSampleLevel(tS,smp,p*vec2f(${TPM / SW},${TPM / SH}),0.).r;}
fn shadow(p:vec2f,l:vec2f,sr:f32)->f32{
  let dv=l-p;let dist=length(dv);let tm=dist-sr;if(tm<=.12){return 1.;}
  let dir=dv/dist;var t=.1;var res=1.;let k=dist/.4;
  for(var i=0;i<8;i++){let h=sdf(p+dir*t);if(h<.004){return 0.;}res=min(res,k*h/t);t+=clamp(h,.12,5.);if(t>=tm){break;}}
  return res*res*(3.-2.*res);
}
fn brdf(N:vec3f,V:vec3f,L:vec3f,dif:vec3f,F0:vec3f,ro:f32)->vec3f{
  let H=normalize(V+L);let nl=max(dot(N,L),0.);let nv=max(dot(N,V),1e-3);let nh=max(dot(N,H),0.);let vh=max(dot(V,H),0.);
  let a=ro*ro;let a2=a*a;let dd=nh*nh*(a2-1.)+1.;let D=a2/(3.14159*dd*dd);
  let k=a*.5;let vis=.25/((nv*(1.-k)+k)*(nl*(1.-k)+k));
  let F=F0+(1.-F0)*pow(1.-vh,5.);
  return (dif*.3183+min(D*vis,30.)*F)*nl;
}
fn plight(P:vec3f,N:vec3f,V:vec3f,dif:vec3f,F0:vec3f,ro:f32,p2:vec2f,lp:vec4f,lc:vec4f)->vec3f{
  let Lv=lp.xyz-P;let d2=dot(Lv,Lv);let r2=lp.w*lp.w;if(d2>=r2){return vec3f(0.);}
  let L=Lv*inverseSqrt(d2);if(dot(N,L)<=0.){return vec3f(0.);}
  let w=1.-d2*d2/(r2*r2);let att=w*w/(d2+1.);if(att*(lc.r+lc.g+lc.b)<.004){return vec3f(0.);}
  let sh=shadow(p2,lp.xz,lc.w);if(sh<=0.){return vec3f(0.);}
  return brdf(N,V,L,dif,F0,ro)*lc.rgb*(att*sh);
}
// is the sun visible from p through the north window row (analytic)
fn sunWin(p:vec3f)->f32{
  let S=g.sun.xyz;let t=(4.-p.z)/S.z;if(t<=0.){return 0.;}
  let h=p+S*t;let fx=fract(h.x*.25)*4.;let cx=floor(h.x*.25);let so=.015+.012*t;
  let mx=smoothstep(.3-so,.3+so,fx)*(1.-smoothstep(3.7-so,3.7+so,fx));
  let my=smoothstep(.9-so,.9+so,h.y)*(1.-smoothstep(7.1-so,7.1+so,h.y));
  let mm=smoothstep(.06-so,.06+so,abs(h.y-4.03));
  return mx*my*mm*step(${winC0}.,cx)*step(cx,${winC1}.);
}
fn sky(d:vec3f)->vec3f{
  var col=vec3f(0.);let pa=2./(g.prj.x*g.res.y);
  for(var l=0;l<2;l++){
    let s=select(170.,90.,l==0);let p=d*s;let id=floor(p);let h=h31(id);
    if(h>.93){
      let o=(vec3f(h31(id+11.3),h31(id+27.1),h31(id+5.7))-.5)*.5;
      let b=pow((h-.93)*14.28,4.);let dist=length(p-id-.5-o)/s;let rs=max(pa*1.3,.0007)*(1.+1.4*b);let e=min(1.,.0007*.0007/(rs*rs))*4.;
      let tint=mix(vec3f(1.,.75,.55),vec3f(.65,.8,1.),h31(id+3.1));
      col+=tint*e*(.1+5.*b)*pow(smoothstep(rs,0.,dist),1.5);
    }
  }
  let nb=fbm3(d*2.2+vec3f(3.1,1.7,9.2));let nb2=fbm3(d*3.7+vec3f(11.,4.,2.));
  col+=vec3f(.22,.07,.36)*pow(nb,4.)*.9+vec3f(.03,.22,.28)*pow(nb2,4.5)*1.3+vec3f(.3,.12,.05)*pow(fbm3(d*1.6+vec3f(7.,2.,5.)),6.)*1.5;
  col+=vec3f(.5,.55,.7)*pow(max(1.-abs(dot(d,normalize(vec3f(.3,.9,.25)))),0.),6.)*.05*(.3+nb*1.4);
  let S=g.sun.xyz;let sd=dot(d,S);
  col+=SUNC*(smoothstep(.99955,.9998,sd)*160.+pow(max(sd,0.),900.)*5.+pow(max(sd,0.),40.)*.25);
  // planet
  let pc=normalize(vec3f(-.5,.22,-.84));let rp=.36;let b=dot(d,pc);let hq=rp*rp-(1.-b*b);
  let ang=sqrt(max(1.-b*b,0.));
  if(b>0.){let rim=.25+.75*smoothstep(-.5,.6,dot(normalize(d-pc*b),normalize(vec3f(.78,.42,.3)))+.25);col+=vec3f(.25,.5,1.)*(exp(-max(ang-rp,0.)*30.)*.7*rim+exp(-max(ang-rp,0.)*120.)*.06);}
  if(b>0.&&hq>0.){
    let n=normalize(d*(b-sqrt(hq))-pc);
    let lit=smoothstep(-.03,.16,dot(n,normalize(vec3f(.78,.42,.3))));
    let q=n*3.+vec3f(fbm3(n*2.+5.)*1.5);
    let f=fbm3(q*vec3f(1.,3.2,1.))*.8+fbm3(q*9.)*.2;let f2=fbm3(q*2.5+8.)*.7+fbm3(q*11.+3.)*.3;
    var pcol=mix(vec3f(.05,.16,.3),vec3f(.5,.36,.25),smoothstep(.42,.6,f));
    pcol=mix(pcol,vec3f(.8,.83,.88),smoothstep(.53,.68,f2)*.75);
    let rim=pow(1.-max(dot(n,-d),0.),4.)*1.8;
    let aa=smoothstep(0.,pa*2.+.004,rp-ang);
    let pl=pcol*lit*1.35+pcol*.008+vec3f(.25,.5,1.)*rim*(lit*1.6+.1);
    col=mix(col,pl,aa);
  }
  return col;
}
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
  let px=vec2i(fc.xy);let uv=fc.xy*g.res.zw;let d=textureLoad(tD,px,0);
  let rd=ray(uv);let rl=length(rd);let dir=rd/rl;
  let nz=ign(fc.xy+5.588238*(g.up.w%64.));let nz2=ign(fc.yx*1.37+3.71*(g.up.w%64.)+17.);
  var col:vec3f;var dist=9.;
  if(d<=0.){col=sky(dir);}
  else{
    let ld=g.prj.z/d;let P=g.cam.xyz+rd*ld;dist=ld*rl;
    let a4=textureLoad(tA,px,0);let n4=textureLoad(tN,px,0);
    let N=normalize(n4.xyz);let ro=max(n4.w,.09);let alb=a4.rgb;let me=a4.a;
    let V=-dir;let F0=mix(vec3f(.04),alb,me);let dif=alb*(1.-me);
    // ambient occlusion (Alchemy, 8 taps, rotated per pixel and per frame)
    let rpx=clamp(.7*g.prj.x*g.res.y*.5/ld,4.,.12*g.res.y);var occ=0.;
    for(var i=0;i<6;i++){
      let a=(f32(i)+nz)*2.399963;let r=sqrt((f32(i)+.5)/6.)*rpx;
      let q=clamp(px+vec2i(vec2f(cos(a),sin(a))*r),vec2i(0),vec2i(g.res.xy)-1);
      let v=posAt(q)-P;let vv=dot(v,v);
      occ+=max(dot(v,N)-.02-.01*ld,0.)/(vv+.03)*smoothstep(1.2,.3,vv);
    }
    let ao=pow(clamp(1.-occ*.2,0.,1.),1.5);
    // lights
    col=textureLoad(tE,px,0).rgb;
    let p2=P.xz+N.xz*.1;
    let pc=P+N*.06;let ci=clamp(vec2i(floor(pc.xz*${1 / CS})),vec2i(0),vec2i(${MW - 1},${MH - 1}));
    let base=u32(ci.y*${MW}+ci.x)*16u;let nl=cells[base];
    var lit=vec3f(0.);
    for(var k=1u;k<=nl;k++){let L=lights[cells[base+k]];lit+=plight(P,N,V,dif,F0,ro,p2,L.p,L.c);}
    let nd=u32(g.misc.x);
    for(var k=0u;k<nd;k++){lit+=plight(P,N,V,dif,F0,ro,p2,g.dyn[k*2u],g.dyn[k*2u+1u]);}
    let S=g.sun.xyz;
    if(dot(N,S)>0.&&P.z>4.&&P.z<56.){
      let sw=sunWin(P+N*.03);
      if(sw>0.){let t=(4.-P.z)/S.z;lit+=brdf(N,V,S,dif,F0,ro)*SUNC*(g.sun.w*sw*shadow(p2,P.xz+S.xz*t,.35));}
    }
    var bs=1.;let nbl=u32(g.misc.w);
    if(N.y>.3&&P.y<1.5){for(var k=0u;k<nbl;k++){let b=g.blob[k];bs*=1.-b.w*(1.-smoothstep(b.z*.3,b.z*1.2,length(P.xz-b.xy)))*clamp(1.-P.y*.7,0.,1.);}}
    col+=(lit*mix(1.,ao,.7)+(dif+F0*.35)*vec3f(.05,.058,.078)*ao)*bs;
    // reflections: screen-space trace into last frame
    var refl=vec3f(.016,.02,.027)*ao*bs;
    if(ro<.47&&max(F0.r,max(F0.g,F0.b))>.1){
      let R=reflect(dir,N);
      let org=P+N*(.012+.003*ld);var st=.025+.008*ld;var t=st*.5;var pt=0.;var hit=false;
      for(var i=0;i<22;i++){
        pt=t;t+=st;st*=1.27;
        let c=g.vp*vec4f(org+R*t,1.);if(c.w<=.02){break;}
        let n=c.xy/c.w;if(abs(n.x)>=1.||abs(n.y)>=1.){break;}
        let sz=g.prj.z/max(textureLoad(tD,vec2i(vec2f(n.x*.5+.5,.5-n.y*.5)*g.res.xy),0),1e-6);
        if(c.w>sz+.01){
          // ignore crossings with the reflecting surface itself (grazing self-intersection)
          let sp=g.cam.xyz+(g.fwd.xyz+g.right.xyz*(n.x-g.jit.x)+g.up.xyz*(n.y-g.jit.y))*sz;
          if(dot(sp-P,N)>.05+.02*t){hit=c.w-sz<.5+st*2.5&&sz>.7;break;}
        }
      }
      if(hit){
        var lo=pt;var hi=t;
        for(var i=0;i<5;i++){
          let mt=(lo+hi)*.5;let c=g.vp*vec4f(org+R*mt,1.);let n=c.xy/c.w;
          let sz=g.prj.z/max(textureLoad(tD,vec2i(vec2f(n.x*.5+.5,.5-n.y*.5)*g.res.xy),0),1e-6);
          if(c.w>sz){hi=mt;}else{lo=mt;}
        }
        // reject hits that did not converge onto a surface (ray passed behind an object)
        let vc=g.vp*vec4f(org+R*hi,1.);let vn=vc.xy/vc.w;
        let vz=g.prj.z/max(textureLoad(tD,vec2i(vec2f(vn.x*.5+.5,.5-vn.y*.5)*g.res.xy),0),1e-6);
        let conf=1.-smoothstep(.06+.03*hi,.2+.1*hi,abs(vc.w-vz));
        let hc=g.pvp*vec4f(org+R*hi,1.);let hu=hc.xy/hc.w*vec2f(.5,-.5)+.5;
        let ed=smoothstep(0.,.08,min(min(hu.x,1.-hu.x),min(hu.y,1.-hu.y)));
        let w=ed*conf*(1.-smoothstep(.17,.47,ro)*.92);
        // slight roughness softening: 9 tap disc limited to ~2 px so thin lights never split into copies
        let rad=min((ro*ro*1.1+.0015)*hi/max(hc.w,.2)*g.prj.x*.5,2.2*g.res.w);let o=vec2f(rad/g.prj.y,rad);
        let hs=textureSampleLevel(tH,smp,hu,0.).rgb*.36+(textureSampleLevel(tH,smp,hu+o*vec2f(.92,.38),0.).rgb+textureSampleLevel(tH,smp,hu+o*vec2f(-.38,.92),0.).rgb+textureSampleLevel(tH,smp,hu+o*vec2f(-.92,-.38),0.).rgb+textureSampleLevel(tH,smp,hu+o*vec2f(.38,-.92),0.).rgb)*.16;
        refl=mix(refl,hs/(1.+max(hs.r,max(hs.g,hs.b))*mix(.12,1.,smoothstep(.15,.5,ro))),w);
      }
    }
    let nv=max(dot(N,V),0.);
    col+=refl*(F0+(max(vec3f(1.-ro),F0)-F0)*pow(1.-nv,5.))*mix(1.,ao,.7);
  }
  // analytic in-scattering from nearby lights
  var fog=vec3f(0.);let nf=u32(g.misc.y);
  for(var k=0u;k<nf;k++){
    let lp=g.fogl[k*2u];let oc=g.cam.xyz-lp.xyz;let b=dot(oc,dir);let s=sqrt(max(dot(oc,oc)-b*b,.16));
    fog+=g.fogl[k*2u+1u].rgb*((atan((dist+b)/s)-atan(b/s))/s);
  }
  col=col*exp(-dist*.003)+fog*.00016;
  // sun shafts through the observation deck windows
  var t0=0.;var t1=min(dist,80.);
  if(abs(dir.z)>1e-4){let ta=(4.05-g.cam.z)/dir.z;let tb=(16.-g.cam.z)/dir.z;t0=max(t0,min(ta,tb));t1=min(t1,max(ta,tb));}
  else if(g.cam.z<4.05||g.cam.z>16.){t1=-1.;}
  if(t1>t0){
    var acc=0.;let dt=(t1-t0)/12.;
    for(var i=0;i<12;i++){let p=g.cam.xyz+dir*(t0+(f32(i)+nz)*dt);acc+=sunWin(p)*step(0.,p.y)*step(p.y,8.);}
    let ct=max(dot(dir,g.sun.xyz),0.);
    col+=SUNC*(g.sun.w*acc*dt*.00016*(.5+3.*pow(ct,5.)));
  }
  return vec4f(col,1.);
}
`;

// ----- additive sprites / beams -----
const WG_SPR = WG_COMMON + /*wgsl*/`
struct Spr{a:vec4f,b:vec4f,c:vec4f};
@group(0)@binding(1)var<storage,read>sp:array<Spr>;
struct SO{@builtin(position)cp:vec4f,@location(0)q:vec2f,@location(1)c:vec4f,@location(2)k:f32};
@vertex fn vs(@builtin(vertex_index)vi:u32,@builtin(instance_index)ii:u32)->SO{
  let s=sp[ii];var cs=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(1.,1.),vec2f(-1.,-1.),vec2f(1.,1.),vec2f(-1.,1.));
  let q=cs[vi];let d=s.b.xyz-s.a.xyz;let l=length(d);var wp:vec3f;
  if(l<1e-4){wp=s.a.xyz+(normalize(g.right.xyz)*q.x+normalize(g.up.xyz)*q.y)*s.a.w;}
  else{let ax=d/l;let sd=normalize(cross(ax,s.a.xyz+d*.5-g.cam.xyz));wp=mix(s.a.xyz,s.b.xyz,q.x*.5+.5)+ax*(q.x*s.a.w)+sd*(q.y*s.a.w);}
  var o:SO;o.cp=g.vp*vec4f(wp,1.);o.q=q;o.c=s.c;o.k=l/max(s.a.w,1e-4);return o;
}
@fragment fn fs(i:SO)->@location(0)vec4f{
  var f=0.;
  if(i.k<1e-3){let r=dot(i.q,i.q);f=exp(-r*3.5)*(1.-smoothstep(.6,1.,r));}
  else{let ex=max(abs(i.q.x)*(i.k*.5+1.)-i.k*.5,0.);let r=ex*ex+i.q.y*i.q.y;f=exp(-r*4.)*(1.-smoothstep(.6,1.,r));}
  return vec4f(i.c.rgb*(i.c.a*f),1.);
}
`;

// ----- temporal anti-aliasing -----
const WG_TAA = WG_COMMON + WG_FS + /*wgsl*/`
@group(1)@binding(0)var tC:texture_2d<f32>;
@group(1)@binding(1)var tH:texture_2d<f32>;
@group(1)@binding(2)var tV:texture_2d<f32>;
@group(1)@binding(3)var tD:texture_depth_2d;
@group(1)@binding(4)var smp:sampler;
fn yc(c:vec3f)->vec3f{return vec3f(.25*c.r+.5*c.g+.25*c.b,.5*c.r-.5*c.b,-.25*c.r+.5*c.g-.25*c.b);}
fn rgb(c:vec3f)->vec3f{return vec3f(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
fn tm(c:vec3f)->vec3f{return c/(1.+max(c.r,max(c.g,c.b)));}
fn itm(c:vec3f)->vec3f{return c/max(1.-max(c.r,max(c.g,c.b)),1e-4);}
fn S(u:vec2f)->vec3f{return tm(textureSampleLevel(tH,smp,u,0.).rgb);}
fn hist(uv:vec2f)->vec3f{
  let p=uv*g.res.xy;let c=floor(p-.5)+.5;let f=p-c;
  let w0=f*(-.5+f*(1.-.5*f));let w1=1.+f*f*(-2.5+1.5*f);let w2=f*(.5+f*(2.-1.5*f));let w3=f*f*(-.5+.5*f);
  let w12=w1+w2;let t0=(c-1.)*g.res.zw;let t3=(c+2.)*g.res.zw;let t12=(c+w2/w12)*g.res.zw;
  let r=S(vec2f(t12.x,t0.y))*(w12.x*w0.y)+S(vec2f(t0.x,t12.y))*(w0.x*w12.y)+S(t12)*(w12.x*w12.y)+S(vec2f(t3.x,t12.y))*(w3.x*w12.y)+S(vec2f(t12.x,t3.y))*(w12.x*w3.y);
  return max(r/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y),vec3f(0.));
}
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
  let px=vec2i(fc.xy);let uv=fc.xy*g.res.zw;let mx=vec2i(g.res.xy)-1;
  var bd=textureLoad(tD,px,0);var bp=px;
  var o4=array<vec2i,4>(vec2i(1,1),vec2i(-1,1),vec2i(1,-1),vec2i(-1,-1));
  for(var i=0;i<4;i++){let q=clamp(px+o4[i],vec2i(0),mx);let dq=textureLoad(tD,q,0);if(dq>bd){bd=dq;bp=q;}}
  var vel=textureLoad(tV,bp,0).xy;
  if(bd<=0.){
    let n=vec2f(uv.x*2.-1.,1.-uv.y*2.)-g.jit.xy;
    let pc=g.pvp*vec4f(g.cam.xyz+(g.fwd.xyz+g.right.xyz*n.x+g.up.xyz*n.y)*2000.,1.);
    vel=(n-pc.xy/pc.w)*vec2f(.5,-.5);
  }
  let cur=tm(textureLoad(tC,px,0).rgb);
  var m1=vec3f(0.);var m2=vec3f(0.);var mn=vec3f(1e9);var mxc=vec3f(-1e9);
  for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
    let c=yc(tm(textureLoad(tC,clamp(px+vec2i(x,y),vec2i(0),mx),0).rgb));m1+=c;m2+=c*c;mn=min(mn,c);mxc=max(mxc,c);
  }}
  m1/=9.;let sg=sqrt(max(m2/9.-m1*m1,vec3f(0.)));
  let lo=max(mn,m1-sg*1.5);let hi=min(mxc,m1+sg*1.5);
  let hu=uv-vel;
  var h=yc(hist(hu));
  // clip towards the neighbourhood centre
  let cen=(lo+hi)*.5;let ext=(hi-lo)*.5+1e-5;let dv=h-cen;let un=abs(dv/ext);let mu=max(un.x,max(un.y,un.z));
  if(mu>1.){h=cen+dv/mu;}
  let ok=hu.x>0.&&hu.x<1.&&hu.y>0.&&hu.y<1.&&g.misc.z<.5;
  let sp=length(vel*g.res.xy);
  let al=select(1.,mix(.06,.2,clamp(sp*.05,0.,1.)),ok);
  return vec4f(itm(mix(rgb(h),cur,al)),1.);
}
`;

// ----- bloom -----
const WG_BLOOM = WG_FS + /*wgsl*/`
@group(0)@binding(0)var tC:texture_2d<f32>;
@group(0)@binding(1)var smp:sampler;
fn T(u:vec2f)->vec3f{return textureSampleLevel(tC,smp,u,0.).rgb;}
fn kw(c:vec3f)->f32{return 1./(1.+max(c.r,max(c.g,c.b)));}
fn down(fc:vec4f,karis:bool)->vec4f{
  let ts=1./vec2f(textureDimensions(tC));let u=fc.xy*2.*ts;
  let a=T(u+ts*vec2f(-2.,-2.));let b=T(u+ts*vec2f(0.,-2.));let c=T(u+ts*vec2f(2.,-2.));
  let d=T(u+ts*vec2f(-2.,0.));let e=T(u);let f=T(u+ts*vec2f(2.,0.));
  let h=T(u+ts*vec2f(-2.,2.));let i=T(u+ts*vec2f(0.,2.));let j=T(u+ts*vec2f(2.,2.));
  let k=T(u+ts*vec2f(-1.,-1.));let l=T(u+ts*vec2f(1.,-1.));let m=T(u+ts*vec2f(-1.,1.));let n=T(u+ts*vec2f(1.,1.));
  var g0=(k+l+m+n)*.25;var g1=(a+b+d+e)*.25;var g2=(b+c+e+f)*.25;var g3=(d+e+h+i)*.25;var g4=(e+f+i+j)*.25;
  if(karis){
    let w0=kw(g0)*.5;let w1=kw(g1)*.125;let w2=kw(g2)*.125;let w3=kw(g3)*.125;let w4=kw(g4)*.125;
    return vec4f((g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4),1.);
  }
  return vec4f(g0*.5+(g1+g2+g3+g4)*.125,1.);
}
@fragment fn fd0(@builtin(position)fc:vec4f)->@location(0)vec4f{return down(fc,true);}
@fragment fn fd(@builtin(position)fc:vec4f)->@location(0)vec4f{return down(fc,false);}
@fragment fn fu(@builtin(position)fc:vec4f)->@location(0)vec4f{
  let ts=1./vec2f(textureDimensions(tC));let u=fc.xy*.5*ts;
  let r=T(u)*4.+(T(u+ts*vec2f(1.,0.))+T(u+ts*vec2f(-1.,0.))+T(u+ts*vec2f(0.,1.))+T(u+ts*vec2f(0.,-1.)))*2.+T(u+ts)+T(u-ts)+T(u+ts*vec2f(1.,-1.))+T(u+ts*vec2f(-1.,1.));
  return vec4f(r*(1./16.),1.);
}
`;

// ----- tonemap + HUD -----
const WG_FINAL = WG_COMMON + WG_FS + /*wgsl*/`
@group(1)@binding(0)var tC:texture_2d<f32>;
@group(1)@binding(1)var tB:texture_2d<f32>;
@group(1)@binding(2)var smp:sampler;
fn sdb(p:vec2f,b:vec2f)->f32{let d=abs(p)-b;return length(max(d,vec2f(0.)))+min(max(d.x,d.y),0.);}
fn seg7(p:vec2f,n:i32)->f32{
  var ms=array<u32,10>(0x3Fu,0x06u,0x5Bu,0x4Fu,0x66u,0x6Du,0x7Du,0x07u,0x7Fu,0x6Fu);let m=ms[n];var d=1e3;
  if((m&1u)!=0u){d=min(d,sdb(p-vec2f(.5,1.9),vec2f(.27,.07)));}
  if((m&64u)!=0u){d=min(d,sdb(p-vec2f(.5,1.),vec2f(.27,.07)));}
  if((m&8u)!=0u){d=min(d,sdb(p-vec2f(.5,.1),vec2f(.27,.07)));}
  if((m&2u)!=0u){d=min(d,sdb(p-vec2f(.9,1.45),vec2f(.07,.3)));}
  if((m&4u)!=0u){d=min(d,sdb(p-vec2f(.9,.55),vec2f(.07,.3)));}
  if((m&16u)!=0u){d=min(d,sdb(p-vec2f(.1,.55),vec2f(.07,.3)));}
  if((m&32u)!=0u){d=min(d,sdb(p-vec2f(.1,1.45),vec2f(.07,.3)));}
  if(n==1){d=min(d,min(sdb(p-vec2f(.7,1.86),vec2f(.14,.07)),sdb(p-vec2f(.86,.1),vec2f(.24,.07))));}
  return d;
}
fn num(p:vec2f,v:f32,nd:i32,h:f32)->f32{
  let w=h*.5;var d=1e3;var val=i32(max(v,0.)+.5);
  for(var i=nd-1;i>=0;i--){
    let dg=val%10;val=val/10;
    d=min(d,seg7((p-vec2f(f32(i)*w*1.4,0.))/w,dg)*w);
    if(val==0){break;}
  }
  return d;
}
fn ink(d:f32)->f32{return clamp(.5-d,0.,1.)+exp(-max(d,0.)*.3)*.12;}
fn plate(p:vec2f,b:vec2f)->vec2f{let d=sdb(p,b-9.)-9.;return vec2f(clamp(.5-d,0.,1.),clamp(1.-abs(d+1.),0.,1.));}
@fragment fn fs(@builtin(position)fc:vec4f)->@location(0)vec4f{
  let px=vec2i(fc.xy);let uv=fc.xy*g.res.zw;let mx=vec2i(g.res.xy)-1;
  let c0=textureLoad(tC,px,0).rgb;
  let nb=(textureLoad(tC,clamp(px+vec2i(1,0),vec2i(0),mx),0).rgb+textureLoad(tC,clamp(px-vec2i(1,0),vec2i(0),mx),0).rgb+textureLoad(tC,clamp(px+vec2i(0,1),vec2i(0),mx),0).rgb+textureLoad(tC,clamp(px-vec2i(0,1),vec2i(0),mx),0).rgb)*.25;
  var col=max(c0+(c0-nb)*.22/(1.+max(c0.g,nb.g)*2.),vec3f(0.));
  col=mix(col,textureSampleLevel(tB,smp,uv,0.).rgb,.065);
  col*=g.prj.w;
  let q=uv-.5;col*=1.-dot(q,q)*.55;
  // filmic curve (ACES fit) with a cool shadow grade
  col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  let l=dot(col,vec3f(.2126,.7152,.0722));
  col=mix(vec3f(l),col,1.08)+vec3f(-.004,.0,.008)*(1.-l);
  col=clamp(col,vec3f(0.),vec3f(1.));
  // HUD
  let s=g.res.y/1080.;let p=vec2f(fc.x,g.res.y-fc.y)/s;let W=g.res.x/s;
  let hp=g.hud0.x;let st=g.hud2.x;
  var hud=vec3f(0.);var pl=vec2f(0.);
  let cy=vec3f(.75,.95,1.);let low=hp<30.;
  let hc=select(cy,vec3f(1.,.25,.15)*(.7+.3*sin(g.cam.w*9.)),low);
  if(p.x<420.&&p.y<150.){
    pl=plate(p-vec2f(186.,72.),vec2f(150.,48.));
    var d=num(p-vec2f(118.,58.),hp,3,44.);
    d=min(d,min(sdb(p-vec2f(76.,80.),vec2f(16.,5.)),sdb(p-vec2f(76.,80.),vec2f(5.,16.))));
    hud+=hc*ink(d);
    let bx=sdb(p-vec2f(186.,40.),vec2f(126.,3.));
    hud+=hc*(ink(bx)*select(.2,1.,p.x<60.+252.*hp/100.));
  }
  if(p.x>W-460.&&p.y<170.){
    let r=p-vec2f(W-390.,54.);
    pl=plate(r-vec2f(162.,26.),vec2f(190.,56.));
    var d=num(r,g.hud0.y,3,52.);
    hud+=cy*ink(d)*select(1.,.4+.6*abs(sin(g.cam.w*12.)),g.hud2.y>0.);
    hud+=cy*.85*ink(num(r-vec2f(158.,0.),g.hud0.z,3,38.));
    let sl=r-vec2f(132.,26.);hud+=cy*.5*ink(sdb(vec2f(sl.x-sl.y*.25,sl.y),vec2f(1.5,26.)));
    hud+=cy*ink(sdb(r-vec2f(178.,64.),vec2f(22.,5.)))*select(.15,1.2,g.hud1.x<.5);
    hud+=cy*ink(sdb(r-vec2f(232.,64.),vec2f(22.,5.)))*select(.15,1.2,g.hud1.x>.5);
    if(g.hud2.y>0.){hud+=cy*ink(sdb(r-vec2f(162.*g.hud2.y-8.,-16.),vec2f(162.*g.hud2.y,2.)));}
  }
  if(abs(p.x-W*.5)<110.&&p.y>1080.-110.){
    let r=p-vec2f(W*.5-14.,1080.-78.);
    pl=plate(r-vec2f(4.,15.),vec2f(78.,34.));
    let hq=r-vec2f(-32.,15.);let dm=max(max(length(hq*vec2f(1.,.8)-vec2f(0.,2.))-11.5,-(length(vec2f(abs(hq.x)-4.6,hq.y-2.))-3.)),-sdb(hq-vec2f(0.,-9.),vec2f(1.2,4.)));
    hud+=vec3f(1.,.5,.35)*(ink(num(r-vec2f(-4.,-4.),g.hud0.w,2,38.))+ink(dm));
  }
  col=mix(col,vec3f(.012,.02,.03),pl.x*.95)+vec3f(.25,.5,.6)*pl.y*.5;
  let cp=p-vec2f(W*.5,540.);
  if(max(abs(cp.x),abs(cp.y))<40.&&st<.5){
    let a=abs(cp);let gap=7.+g.hud2.w*10.;
    var d=min(sdb(vec2f(a.x-gap-5.,a.y),vec2f(5.,1.)),sdb(vec2f(a.x,a.y-gap-5.),vec2f(1.,5.)));
    d=min(d,length(cp)-1.2);
    col*=1.-.7*clamp(2.-d,0.,1.);hud+=vec3f(.9,1.,1.)*clamp(.5-d,0.,1.)*.95;
    let hm=g.hud1.w;
    if(hm>0.){let r=vec2f(a.x-a.y,a.x+a.y)*.7071;hud+=vec3f(1.,.3,.2)*clamp(.5-max(sdb(vec2f(r.x,r.y-17.),vec2f(1.2,6.)),-1.),0.,1.)*hm;}
  }
  col+=hud*.9;
  col=mix(col,vec3f(.6,.02,.0),clamp(g.hud1.y,0.,1.)*dot(q,q)*2.2);
  col+=vec3f(.2,.6,.3)*g.hud1.z*dot(q,q)*.9;
  if(st>.5&&st<1.5){let lm=dot(col,vec3f(.33));col=mix(col,vec3f(lm*.9,lm*.12,lm*.08),.8);}
  // sRGB encode + dither against banding
  col=mix(col*12.92,1.055*pow(col,vec3f(1./2.4))-.055,step(vec3f(.0031308),col));
  let n=fract(52.9829189*fract(dot(fc.xy+g.up.w*vec2f(5.588,3.17),vec2f(.06711056,.00583715))));
  let n2=fract(52.9829189*fract(dot(fc.yx+g.up.w*vec2f(2.71,7.3)+31.,vec2f(.06711056,.00583715))));
  return vec4f(col+(n+n2-1.)/255.,1.);
}
`;
