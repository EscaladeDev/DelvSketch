function key(p){ return (p.x|0) + "," + (p.y|0) }

export function contoursFromAlpha(imageData, width, height, step=4, threshold=1) {
  const w = Math.floor(width/step)
  const h = Math.floor(height/step)
  const samples = new Uint8Array((w+1)*(h+1))

  const data = imageData.data
  for (let gy=0; gy<=h; gy++){
    for (let gx=0; gx<=w; gx++){
      const x = Math.min(width-1, gx*step)
      const y = Math.min(height-1, gy*step)
      const idx = (y*width + x) * 4 + 3
      samples[gy*(w+1)+gx] = data[idx] > threshold ? 1 : 0
    }
  }

  const table = {
    0:  [], 1:  [[0,0.5, 0.5,0]], 2:  [[0.5,0, 1,0.5]], 3:  [[0,0.5, 1,0.5]],
    4:  [[1,0.5, 0.5,1]], 5:  [[0,0.5, 0.5,0],[1,0.5, 0.5,1]], 6:  [[0.5,0, 0.5,1]], 7:  [[0,0.5, 0.5,1]],
    8:  [[0.5,1, 0,0.5]], 9:  [[0.5,0, 0.5,1]], 10: [[0.5,0, 1,0.5],[0.5,1, 0,0.5]], 11: [[1,0.5, 0.5,1]],
    12: [[1,0.5, 0,0.5]], 13: [[0.5,0, 1,0.5]], 14: [[0,0.5, 0.5,0]], 15: []
  }

  const segs = []
  for (let y=0; y<h; y++){
    for (let x=0; x<w; x++){
      const a = samples[y*(w+1)+x]
      const b = samples[y*(w+1)+x+1]
      const c = samples[(y+1)*(w+1)+x+1]
      const d = samples[(y+1)*(w+1)+x]
      const code = (a<<0) | (b<<1) | (c<<2) | (d<<3)
      const seglist = table[code]
      if (!seglist || seglist.length===0) continue
      const ox = x*step
      const oy = y*step
      for (const s of seglist){
        const p1 = { x: ox + s[0]*step, y: oy + s[1]*step }
        const p2 = { x: ox + s[2]*step, y: oy + s[3]*step }
        segs.push([p1,p2])
      }
    }
  }

  const startMap = new Map()
  const endMap = new Map()
  const polys = []

  function addSegment(p1,p2){
    const k1 = key(p1), k2 = key(p2)
    const endIdx = endMap.get(k1)
    const startIdx = startMap.get(k2)
    if (endIdx != null && startIdx != null && endIdx !== startIdx){
      const A = polys[endIdx]
      const B = polys[startIdx]
      A.push(...B)
      polys[startIdx] = null
      return
    }
    if (endIdx != null){
      const poly = polys[endIdx]
      poly.push(p2)
      endMap.delete(k1); endMap.set(k2, endIdx)
      return
    }
    if (startIdx != null){
      const poly = polys[startIdx]
      poly.unshift(p1)
      startMap.delete(k2); startMap.set(k1, startIdx)
      return
    }
    const idx = polys.length
    polys.push([p1,p2])
    startMap.set(k1, idx)
    endMap.set(k2, idx)
  }

  for (const [p1,p2] of segs) addSegment(p1,p2)
  return polys.filter(Boolean)
}
