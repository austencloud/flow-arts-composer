/**
 * Stops a media element and closes its download. Taking the element off the
 * page does neither: a removed video keeps playing, and keeps its download
 * open until its source goes. A paused download stops reading its bytes, and
 * over HTTP/2 every such stream holds part of the connection's shared receive
 * window. A few of them starve every later response from the same server, so
 * a fetch gets its headers but never its body.
 */
export function releaseMediaDownload(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute("src");
  element.load();
}
