// Synthesized in the browser: no asset downloads, autoplay, or remote audio.
export function createAudio(){
  let ctx,master,noise;
  function unlock(){try{ctx??=new(window.AudioContext||window.webkitAudioContext)();if(!master){master=ctx.createGain();master.gain.value=.38;master.connect(ctx.destination);noise=ctx.createBuffer(1,ctx.sampleRate*.3,ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}ctx.resume();}catch{}}
  function tone(freq,end,duration,volume,type='sine',delay=0){const time=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,time);o.frequency.exponentialRampToValueAtTime(end,time+duration);g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.001,time+duration);o.connect(g);g.connect(master);o.start(time);o.stop(time+duration+.01);}
  function hiss(duration,frequency,volume){const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=noise;f.type='bandpass';f.frequency.value=frequency;g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);n.connect(f);f.connect(g);g.connect(master);n.start();n.stop(ctx.currentTime+duration);}
  function play(kind,heavy=false){unlock();if(!ctx)return;
    if(kind==='heart'){tone(660,760,.17,.065);tone(880,1046,.23,.05,'sine',.11);}
    else if(kind==='water'){hiss(.28,2100,.07);tone(820,410,.12,.04);}
    else if(kind==='plant'||kind==='harvest'){tone(440,660,.19,.06,'triangle');tone(784,880,.18,.04,'sine',.12);}
    else if(kind==='emote'){tone(520,690,.12,.025);}
    else if(kind==='swing'){hiss(.14,heavy?950:1700,.15);tone(heavy?110:190,60,.12,.08,'triangle');}
    else if(kind==='hit'){tone(heavy?95:160,45,.13,heavy?.34:.20,'triangle');hiss(.09,2300,.23);}
    else if(kind==='hurt'){tone(180,65,.25,.22,'sawtooth');hiss(.16,650,.12);}
    else if(kind==='skill'||kind==='slam'){tone(140,35,.34,.3,'triangle');hiss(.3,kind==='skill'?1400:400,.3);}
    else if(kind==='dash'){hiss(.18,2800,.13);}
    else if(kind==='death'){tone(320,70,.2,.13,'triangle');tone(620,440,.18,.08,'sine',.08);}
    else if(kind==='level'||kind==='quest'){[440,554,659,880].forEach((f,i)=>tone(f,f,.27,.10,'sine',i*.09));}
    else if(kind==='heal'){[392,523,659].forEach((f,i)=>tone(f,f*1.05,.3,.07,'sine',i*.08));}
    else if(['tree','rock','herb'].includes(kind)){tone(kind==='rock'?600:180,90,.12,.14,'triangle');hiss(.08,1000,.08);}
    else tone(700,1000,.17,.07);
  }
  return {play,unlock};
}
