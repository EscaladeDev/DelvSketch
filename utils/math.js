export const EPS = 1e-9
export function add(a,b){ return {x:a.x+b.x, y:a.y+b.y} }
export function sub(a,b){ return {x:a.x-b.x, y:a.y-b.y} }
export function scale(a,s){ return {x:a.x*s, y:a.y*s} }
export function dot(a,b){ return a.x*b.x + a.y*b.y }
export function len(a){ return Math.hypot(a.x,a.y) }
export function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y) }
export function norm(a){
  const l = len(a)
  if (l < EPS) return {x:0,y:0}
  return {x:a.x/l, y:a.y/l}
}
export function rotate(v, ang){
  const c=Math.cos(ang), s=Math.sin(ang)
  return {x:v.x*c - v.y*s, y:v.x*s + v.y*c}
}
export function lerp(a,b,t){ return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t} }
