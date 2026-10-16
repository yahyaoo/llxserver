/** 全主题、外观及可见控件的实际颜色对比审计，包含透明背景叠加。 @author jingyh @date 2026-10-11 */
async page => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.waitForFunction(() => window.ElementControls && window.LocalMusicManager && window.MusicExperience)
  await page.evaluate(() => {
    const style = document.createElement('style'); style.id = 'readability-test-motion'; style.textContent = '*,*::before,*::after { transition:none!important; animation:none!important; }'; document.head.append(style)
  })
  await page.evaluate(() => { window.__readabilityAudit = () => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
    const rgb = color => { ctx.clearRect(0,0,1,1);ctx.fillStyle = color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v) }
    const over = (a,b) => a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1)
    const luminance = a => a.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)
    const failures = []; let checked = 0
    for (const el of document.querySelectorAll('i,svg,button,a,input,select,textarea,p,span,h1,h2,h3,label,th,td')) {
      if (!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) || el.closest('[aria-hidden="true"],.lx-element-source')) continue
      const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom<0 || r.top>innerHeight || r.right<0 || r.left>innerWidth) continue
      const icon = el.matches('i,svg'), ownText = [...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())
      if (!icon && !ownText && !el.matches('input,textarea')) continue
      // 遮挡层、离屏抽屉及尚未展开的菜单不属于当前可见界面。
      const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)), y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)), hit=document.elementFromPoint(x,y)
      if (!hit || !(el.contains(hit)||hit.contains(el))) continue
      if (el.closest(':disabled,[aria-disabled="true"],.is-disabled')) continue
      let bg=[255,255,255,1]; const parents=[];for(let p=el;p;p=p.parentElement)parents.unshift(p)
      for(const p of parents) {
        const style=getComputedStyle(p);bg=over(rgb(style.backgroundColor),bg)
        // 渐变按最亮与最暗端点中点取样，覆盖热搜序号等实色渐变背景。
        if(style.backgroundImage.startsWith('linear-gradient')) {
          const colors=style.backgroundImage.match(/rgba?\([^)]+\)/g)
          if(colors?.length) {const values=colors.map(rgb);bg=over(values[0].map((v,i)=>values.reduce((sum,c)=>sum+c[i],0)/values.length),bg)}
        }
      }
      const s=getComputedStyle(el), color=rgb(s.color);color[3]*=Number(s.opacity)
      const fg=over(color,bg), l=[luminance(fg),luminance(bg)].sort((a,b)=>b-a), ratio=(l[0]+.05)/(l[1]+.05)
      const minimum=icon?3:parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700?3:4.5
      checked++
      if(ratio+.03<minimum)failures.push({id:el.id||el.closest('button,a')?.id,tag:el.tagName,cls:el.className?.baseVal??el.className,text:(el.textContent||el.placeholder||'').trim().slice(0,45),ratio:+ratio.toFixed(2),minimum,color:s.color,bg:bg.slice(0,3).map(Math.round)})
    }
    return {checked,failures}
  } })
  const audit = () => page.evaluate(() => window.__readabilityAudit())
  const results=[]
  const themes = await page.evaluate(() => [...THEMES])
  for(const systemDark of [false,true]) {
    await page.emulateMedia({colorScheme:systemDark?'dark':'light'})
    for(const appearance of systemDark?['system']:['light','dark','pure-white','pure-black','system']) {
      for(const theme of themes) {
        await page.evaluate(async ({theme,appearance})=>{ await MusicExperience.change({theme,appearance}); switchTab('localmusic') },{theme,appearance})
        await page.mouse.move(350,500)
        results.push({theme,appearance,systemDark,...await audit()})
      }
    }
  }
  // 后续跨页面与交互测试复用同一审计函数，统一阈值。
  const failures=results.filter(r=>r.failures.length)
  if(failures.length) throw new Error(JSON.stringify(failures.slice(0,3)))
  return {combinations:results.length,checked:results.reduce((n,r)=>n+r.checked,0),failures}
}
