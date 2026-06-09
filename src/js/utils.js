window.escHtml = function (str) {
  return String(str).replace(
    /[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
}
function resolveNamingRuleImpl(rule, content) {
  const now = new Date(),
    date = now.toISOString().slice(0, 10),
    time = now.toTimeString().slice(0, 8).replace(/:/g, ''),
    datetime = date + '_' + time,
    timestamp = String(Math.floor(Date.now() / 1e3)),
    random = Math.random().toString(36).substring(2, 8),
    h1 = content.match(/^#\s+(.+)/m),
    title = h1 ? h1[1].replace(/[/\\:*?"<>|]/g, '_').trim() : '未命名'
  return rule
    .replace(/{title}/g, title)
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
    .replace(/{datetime}/g, datetime)
    .replace(/{timestamp}/g, timestamp)
    .replace(/{random}/g, random)
}
window.resolveNamingRule = resolveNamingRuleImpl
if (typeof module !== 'undefined' && module.exports) module.exports = { resolveNamingRule: resolveNamingRuleImpl }
