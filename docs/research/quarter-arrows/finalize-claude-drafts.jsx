// Finalize Claude's drafts in quarter-turn-working.ai (artboard 4, quarter-turn sheet).
// Run from Illustrator: File > Scripts > Other Script... with quarter-turn-working.ai open.
// For every group named "draft ..." on the "Claude drafts" layer:
//   - a group with a "centerline" path: re-seats the head stamp on the centerline's end tangent,
//     outlines the 2 pt stroke, merges it with the head and writes one filled path to "Claude final"
//   - a group without one (a copy of Austen's outline): carried over as it stands
// Existing "Claude final" items with the same name are replaced. Other layers are locked while it runs.
// ExtendScript (ES3): no trailing commas, no let/const.
var doc = app.documents.getByName("quarter-turn-working.ai"); doc.activate();

function cmyk(c,m,y,k){var x=new CMYKColor();x.cyan=c;x.magenta=m;x.yellow=y;x.black=k;return x;}
var BLUE = cmyk(100,100,0,0);
function getLayer(doc, name){ var L; try { L = doc.layers.getByName(name); } catch(e) { L = doc.layers.add(); L.name = name; } L.locked=false; L.visible=true; return L; }
function setPts(p, pts){ for (var k=0;k<pts.length;k++){ var q=p.pathPoints.add(); q.anchor=[pts[k][0],pts[k][1]]; q.leftDirection=[pts[k][2],pts[k][3]]; q.rightDirection=[pts[k][4],pts[k][5]]; q.pointType=PointType.CORNER; } }
function styleStroke(b){ b.closed=false; b.filled=false; b.stroked=true; b.strokeColor=BLUE; b.strokeWidth=2; b.strokeCap=StrokeCap.ROUNDENDCAP; b.strokeJoin=StrokeJoin.MITERENDJOIN; b.strokeMiterLimit=10; }
var STAMP = [[-1.50907, 0.851, -1.50907, 0.851, -1.50907, 0.851], [-4.19815, 3.58182, -4.19815, 3.58182, -4.19815, 3.58182], [-2.32801, 4.08126, -3.14779, 4.68151, -1.1483, 3.23082], [1.62065, 0.0, 1.62065, 0.0, 1.62065, 0.0], [-2.3306, -4.06873, -1.39047, -3.37901, -3.15088, -4.67857], [-4.20048, -3.59821, -4.20048, -3.59821, -4.20048, -3.59821], [-1.49966, -0.949, -1.49966, -0.949, -1.49966, -0.949]];
function headAt(parent, end, fwd){
  var c = fwd[0], s = fwd[1]; var h = parent.pathItems.add(); var pts = [];
  for (var k=0;k<STAMP.length;k++){ var q = STAMP[k]; var row = [];
    for (var j=0;j<6;j+=2) { row.push(end[0] + c*q[j] - s*q[j+1]); row.push(end[1] + s*q[j] + c*q[j+1]); }
    pts.push(row); }
  setPts(h, pts); h.closed=true; h.filled=true; h.fillColor=BLUE; h.stroked=false; h.name="head"; return h;
}
function endTangent(p){
  var n = p.pathPoints.length; var a = p.pathPoints[n-1].anchor; var l = p.pathPoints[n-1].leftDirection;
  var d = [a[0]-l[0], a[1]-l[1]];
  if (Math.sqrt(d[0]*d[0]+d[1]*d[1]) < 1e-6) { var r = p.pathPoints[n-2].rightDirection; d = [a[0]-r[0], a[1]-r[1]];
    if (Math.sqrt(d[0]*d[0]+d[1]*d[1]) < 1e-6) { var b = p.pathPoints[n-2].anchor; d = [a[0]-b[0], a[1]-b[1]]; } }
  var m = Math.sqrt(d[0]*d[0]+d[1]*d[1]); return [a, [d[0]/m, d[1]/m]];
}
function lockAllBut(doc, keep){ var s=[]; for (var i=0;i<doc.layers.length;i++){ var L=doc.layers[i]; s.push([L, L.locked]); var k=false; for (var j=0;j<keep.length;j++) if (keep[j]===L) k=true; if (!k) L.locked=true; } return s; }
function restore(s){ for (var i=0;i<s.length;i++) s[i][0].locked = s[i][1]; }


var D = doc.layers.getByName("Claude drafts"); var F = getLayer(doc, "Claude final");
var saved = lockAllBut(doc, [D, F]); var out = [];
function leaves(it, acc){ if (it.typename=="GroupItem"){ for (var i=0;i<it.pageItems.length;i++) leaves(it.pageItems[i], acc);} else acc.push(it); return acc; }
function size(it){ return it.typename=="CompoundPathItem" ? it.pathItems.length + " subpaths" : it.pathPoints.length + " points"; }
for (var i=0;i<D.groupItems.length;i++){
  var g = D.groupItems[i]; if (g.name.indexOf("draft ")!=0) continue;
  var label = g.name.substring(6); var c = null;
  for (var j=F.pageItems.length-1;j>=0;j--) { var n = F.pageItems[j].name; if (n==label || n==label+" (UNMERGED)") F.pageItems[j].remove(); }
  for (var j=0;j<g.pathItems.length;j++) if (g.pathItems[j].name=="centerline") c = g.pathItems[j];
  if (!c) {   // a copy of Austen's outline or a mirrored outline: carried over as it stands
    var parts = []; for (var j=0;j<g.pageItems.length;j++) if (g.pageItems[j].name!="head") parts.push(g.pageItems[j]);
    if (parts.length != 1) { out.push(label + ": expected one outline, found " + parts.length); continue; }
    var cp = parts[0].duplicate(F, ElementPlacement.PLACEATBEGINNING); cp.name = label; out.push(label + ": outline carried, " + size(cp)); continue;
  }
  var b = c.duplicate(F, ElementPlacement.PLACEATBEGINNING); styleStroke(b);
  var et = endTangent(c); var h = headAt(F, et[0], et[1]);
  doc.selection = null; b.selected = true; app.redraw(); app.executeMenuCommand("OffsetPath v22"); app.redraw();
  var body = doc.selection[0]; var gg = F.groupItems.add(); h.move(gg, ElementPlacement.PLACEATEND); body.move(gg, ElementPlacement.PLACEATEND);
  doc.selection = null; gg.selected = true; app.redraw();
  app.executeMenuCommand("Live Pathfinder Add"); app.redraw(); app.executeMenuCommand("expandStyle"); app.redraw();
  var res = doc.selection[0]; var lv = leaves(res, []);
  if (lv.length == 1) { lv[0].move(F, ElementPlacement.PLACEATBEGINNING); if (res !== lv[0]) res.remove(); lv[0].name = label; out.push(label + ": merged, " + size(lv[0])); }
  else { res.name = label + " (UNMERGED)"; out.push(label + ": NOT merged (" + lv.length + " pieces)"); }
}
doc.selection = null; restore(saved); D.visible = false; F.visible = true;
doc.save();
var bad = []; for (var i=0;i<out.length;i++) if (out[i].indexOf("NOT merged")>=0 || out[i].indexOf("expected one")>=0) bad.push(out[i]);
alert("Finalized " + out.length + " drafts onto Claude final and saved." + (bad.length ? "\n\nNeeds a look:\n" + bad.join("\n") : ""));
